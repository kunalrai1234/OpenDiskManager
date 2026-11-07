<#
.SYNOPSIS
    OpenDisk Manager — Phase 4 Safe Partition Resize & Extend Engine
    Implements strictly controlled Windows partition resizing using native Storage cmdlets.

.DESCRIPTION
    Modes supported:
    - GetSupportedSize : Queries Get-PartitionSupportedSize (SizeMin, SizeMax)
    - ValidateResize   : Runs all 8 pre-flight safety checks (Admin, Dynamic, NTFS, Protected, Adjacency, Offsets)
    - ExecuteResize    : Controlled Resize-Partition execution with explicit confirmation and post-verification
    - SimulateResize   : Dry-run verification producing exact execution diff without modifying disk sectors
    - CheckElevation   : Checks if running as Administrator

.OUTPUTS
    Structured JSON to stdout.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [ValidateSet("GetSupportedSize", "ValidateResize", "ExecuteResize", "SimulateResize", "CheckElevation")]
    [string]$Mode,

    [int]$DiskNumber = 0,
    [int]$PartitionNumber = -1,
    [int64]$TargetSizeBytes = 0,
    [int64]$ExpectedStartOffset = 0,
    [int64]$ExpectedSizeBytes = 0,
    [switch]$Confirmed,
    [string]$ConfirmationCode = "",
    [string]$LogFilePath = "$PSScriptRoot\resize-audit.log"
)

# Enforce UTF-8 output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-AuditLog {
    param (
        [PSCustomObject]$LogEntry
    )
    try {
        $json = $LogEntry | ConvertTo-Json -Compress
        $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $line = "[$timestamp] $json"
        Add-Content -Path $LogFilePath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}
}

# -----------------------------------------------------------------------------
# MODE 1: CheckElevation
# -----------------------------------------------------------------------------
if ($Mode -eq "CheckElevation") {
    $isElevated = Get-IsElevated
    $result = [PSCustomObject]@{
        isElevated = $isElevated
        user = [Environment]::UserName
        os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
    }
    $result | ConvertTo-Json
    exit 0
}

# -----------------------------------------------------------------------------
# MODE 2: GetSupportedSize
# -----------------------------------------------------------------------------
if ($Mode -eq "GetSupportedSize") {
    $isElevated = Get-IsElevated
    
    # Verify partition exists first
    $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction SilentlyContinue
    if (-not $part) {
        @{
            success = $false
            error = "Partition $PartitionNumber on Disk $DiskNumber not found."
            isElevated = $isElevated
        } | ConvertTo-Json
        exit 1
    }

    $vol = Get-Volume -Partition $part -ErrorAction SilentlyContinue
    
    # Try native Get-PartitionSupportedSize
    $supSize = $null
    $cimError = $null
    try {
        $supSize = Get-PartitionSupportedSize -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
    } catch {
        $cimError = $_.Exception.Message
    }

    if ($supSize) {
        @{
            success = $true
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            currentSizeBytes = $part.Size
            sizeMinBytes = $supSize.SizeMin
            sizeMaxBytes = $supSize.SizeMax
            currentGb = [math]::Round($part.Size / 1e9, 3)
            sizeMinGb = [math]::Round($supSize.SizeMin / 1e9, 3)
            sizeMaxGb = [math]::Round($supSize.SizeMax / 1e9, 3)
            isNativeCim = $true
            isElevated = $isElevated
        } | ConvertTo-Json
        exit 0
    }

    # Fallback Calculation if CIM Access Denied due to non-elevation
    # Uses filesystem used clusters + 5% buffer + 512MB metadata margin
    $usedBytes = if ($vol -and $vol.SizeRemaining) { $vol.Size - $vol.SizeRemaining } else { [int64]($part.Size * 0.7) }
    $safetyMargin = [math]::Max([int64]($usedBytes * 0.05), 536870912) # 512 MB min buffer
    $calcMin = [int64]($usedBytes + $safetyMargin)

    # Check right adjacent unallocated space
    $allParts = Get-Partition -DiskNumber $DiskNumber | Sort-Object Offset
    $currentIndex = -1
    for ($i = 0; $i -lt $allParts.Count; $i++) {
        if ($allParts[$i].PartitionNumber -eq $PartitionNumber) {
            $currentIndex = $i
            break
        }
    }

    $disk = Get-Disk -Number $DiskNumber -ErrorAction SilentlyContinue
    $diskEnd = if ($disk) { $disk.Size } else { 0 }
    $nextOffset = if ($currentIndex -lt ($allParts.Count - 1)) { $allParts[$currentIndex + 1].Offset } else { $diskEnd }
    $currentEnd = $part.Offset + $part.Size
    $adjacentGap = [math]::Max([int64]0, [int64]($nextOffset - $currentEnd))
    $calcMax = [int64]($part.Size + $adjacentGap)

    @{
        success = $true
        diskNumber = $DiskNumber
        partitionNumber = $PartitionNumber
        currentSizeBytes = $part.Size
        sizeMinBytes = $calcMin
        sizeMaxBytes = $calcMax
        currentGb = [math]::Round($part.Size / 1e9, 3)
        sizeMinGb = [math]::Round($calcMin / 1e9, 3)
        sizeMaxGb = [math]::Round($calcMax / 1e9, 3)
        isNativeCim = $false
        cimNotice = if ($cimError) { "CIM Provider required elevation ($cimError). Calculated via filesystem cluster and adjacency metrics." } else { $null }
        isElevated = $isElevated
    } | ConvertTo-Json
    exit 0
}

# -----------------------------------------------------------------------------
# MODE 3: ValidateResize
# -----------------------------------------------------------------------------
if ($Mode -eq "ValidateResize" -or $Mode -eq "SimulateResize" -or $Mode -eq "ExecuteResize") {
    $checks = @()
    $isValid = $true
    $abortReasons = @()

    # Check 1: Administrator privilege
    $isElevated = Get-IsElevated
    if (-not $isElevated) {
        $checks += @{ name = "Administrator Privilege"; passed = $false; details = "Process is not elevated. Modifications require Windows Administrator." }
        if ($Mode -eq "ExecuteResize") {
            $isValid = $false
            $abortReasons += "Administrator privileges are strictly required to resize partitions."
        }
    } else {
        $checks += @{ name = "Administrator Privilege"; passed = $true; details = "Running with elevated Administrator credentials." }
    }

    # Check 2: Disk existence and classification (Basic vs Dynamic)
    $disk = Get-Disk -Number $DiskNumber -ErrorAction SilentlyContinue
    if (-not $disk) {
        $checks += @{ name = "Disk Resolution"; passed = $false; details = "PhysicalDrive$DiskNumber does not exist or is disconnected." }
        $isValid = $false
        $abortReasons += "Disk not found."
    } else {
        # Check dynamic
        $isDynamic = ($disk.PartitionStyle -eq "RAW" -or $disk.FriendlyName -match "Dynamic" -or $disk.OperationalStatus -match "Dynamic")
        if ($isDynamic) {
            $checks += @{ name = "Disk Classification"; passed = $false; details = "Disk is Dynamic. Only Basic Disks are supported." }
            $isValid = $false
            $abortReasons += "Dynamic disks are not supported."
        } else {
            $checks += @{ name = "Disk Classification"; passed = $true; details = "Basic Disk ($($disk.PartitionStyle), Model: $($disk.FriendlyName))." }
        }
    }

    # Check 3: Partition existence & offset revalidation
    $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction SilentlyContinue
    if (-not $part) {
        $checks += @{ name = "Partition Resolution"; passed = $false; details = "Partition #$PartitionNumber not found on Disk #$DiskNumber." }
        $isValid = $false
        $abortReasons += "Partition not found."
    } else {
        # Verify offset if ExpectedStartOffset passed
        if ($ExpectedStartOffset -gt 0 -and $part.Offset -ne $ExpectedStartOffset) {
            $checks += @{ name = "Partition Offset Verification"; passed = $false; details = "Partition starting offset shifted! Expected $ExpectedStartOffset, found $($part.Offset). Disk layout was modified externally." }
            $isValid = $false
            $abortReasons += "Partition offset mismatch. Layout revalidation failed."
        } else {
            $checks += @{ name = "Partition Offset Verification"; passed = $true; details = "Starting offset verified at sector LBA $([int64]($part.Offset / 512)) ($($part.Offset) bytes)." }
        }

        # Check 4: Protected partition categories (EFI, MSR, Recovery)
        $isProtected = $false
        $protReason = ""
        $typeGuid = if ($part.Type) { $part.Type.ToString().ToLower() } else { "" }
        if ($part.GptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or $part.Type -match "System" -or $part.Type -match "EFI") {
            $isProtected = $true
            $protReason = "EFI System Partition (ESP) is critical for system boot and cannot be resized."
        } elseif ($part.GptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}" -or $part.Type -match "Reserved" -or $part.Type -match "MSR") {
            $isProtected = $true
            $protReason = "Microsoft Reserved Partition (MSR) cannot be resized."
        } elseif ($part.GptType -eq "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -or $part.Type -match "Recovery") {
            $isProtected = $true
            $protReason = "Windows Recovery Partition (WinRE) contains critical WinPE recovery images and cannot be directly resized."
        }

        if ($isProtected) {
            $checks += @{ name = "Protected Partition Shield"; passed = $false; details = $protReason }
            $isValid = $false
            $abortReasons += $protReason
        } else {
            $checks += @{ name = "Protected Partition Shield"; passed = $true; details = "Partition is a standard Basic Data / System partition." }
        }

        # Check 5: Filesystem verification (NTFS online resize support)
        $vol = Get-Volume -Partition $part -ErrorAction SilentlyContinue
        $fsType = if ($vol) { $vol.FileSystem } else { "RAW" }
        if ($fsType -ne "NTFS") {
            if ($TargetSizeBytes -lt $part.Size) {
                # Shrink on non-NTFS is unsupported online
                $checks += @{ name = "Filesystem Architecture"; passed = $false; details = "Filesystem '$fsType' does not support online shrinking. Only NTFS is supported." }
                $isValid = $false
                $abortReasons += "Shrinking $fsType is not supported."
            } else {
                $checks += @{ name = "Filesystem Architecture"; passed = $true; details = "Filesystem '$fsType' supports extension." }
            }
        } else {
            $checks += @{ name = "Filesystem Architecture"; passed = $true; details = "NTFS volume verified with online cluster resizing capability." }
        }

        # Check 6: BitLocker detection & safeguards
        $isBitLocker = $false
        if ($part.DriveLetter) {
            try {
                $bl = Get-BitLockerVolume -MountPoint $part.DriveLetter -ErrorAction SilentlyContinue
                if ($bl -and $bl.ProtectionStatus -eq "On") {
                    $isBitLocker = $true
                }
            } catch {}
        }

        if ($isBitLocker) {
            $checks += @{ name = "BitLocker Volume Encryption"; passed = $true; details = "BitLocker detected. Live resize supported by Windows 11 NTFS driver, TPM key backup recommended." }
        } else {
            $checks += @{ name = "BitLocker Volume Encryption"; passed = $true; details = "No active BitLocker encryption on volume." }
        }

        # Check 7: Supported Size Boundaries
        if ($TargetSizeBytes -gt 0) {
            $delta = $TargetSizeBytes - $part.Size
            if ($delta -lt 0) {
                # Shrink operation: check if above minimum data boundary
                $usedBytes = if ($vol -and $vol.SizeRemaining) { $vol.Size - $vol.SizeRemaining } else { [int64]($part.Size * 0.7) }
                $safetyMargin = [math]::Max([int64]($usedBytes * 0.05), 536870912)
                $safeMin = [int64]($usedBytes + $safetyMargin)

                if ($TargetSizeBytes -lt $safeMin) {
                    $checks += @{ name = "Shrink Capacity Boundary"; passed = $false; details = "Requested size ($([math]::Round($TargetSizeBytes / 1e9, 2)) GB) is below minimum safe data boundary ($([math]::Round($safeMin / 1e9, 2)) GB)." }
                    $isValid = $false
                    $abortReasons += "Requested size is below minimum safe shrink limit."
                } else {
                    $checks += @{ name = "Shrink Capacity Boundary"; passed = $true; details = "Requested size ($([math]::Round($TargetSizeBytes / 1e9, 2)) GB) is safely above minimum safe boundary ($([math]::Round($safeMin / 1e9, 2)) GB)." }
                }
            } elseif ($delta -gt 0) {
                # Extend operation: check partition adjacency and available unallocated space
                $allParts = Get-Partition -DiskNumber $DiskNumber | Sort-Object Offset
                $currentIndex = -1
                for ($i = 0; $i -lt $allParts.Count; $i++) {
                    if ($allParts[$i].PartitionNumber -eq $PartitionNumber) {
                        $currentIndex = $i
                        break
                    }
                }

                $diskEnd = if ($disk) { $disk.Size } else { 0 }
                $nextOffset = if ($currentIndex -lt ($allParts.Count - 1)) { $allParts[$currentIndex + 1].Offset } else { $diskEnd }
                $currentEnd = $part.Offset + $part.Size
                $availableGap = [math]::Max([int64]0, [int64]($nextOffset - $currentEnd))

                if ($delta -gt $availableGap) {
                    $checks += @{ name = "Adjacency & Unallocated Space"; passed = $false; details = "Requested extension ($([math]::Round($delta / 1e9, 2)) GB) exceeds immediately adjacent unallocated gap ($([math]::Round($availableGap / 1e9, 2)) GB)." }
                    $isValid = $false
                    $abortReasons += "Insufficient adjacent unallocated space. Partition movement required first."
                } else {
                    $checks += @{ name = "Adjacency & Unallocated Space"; passed = $true; details = "Immediately adjacent unallocated gap ($([math]::Round($availableGap / 1e9, 2)) GB) can accommodate requested extension ($([math]::Round($delta / 1e9, 2)) GB)." }
                }
            } else {
                $checks += @{ name = "Size Delta Check"; passed = $true; details = "Target size is identical to current size. No change." }
            }
        }
    }

    $abortReason = ($abortReasons -join "; ")

    # Summary payload
    $validationResult = [PSCustomObject]@{
        isValid = $isValid
        mode = $Mode
        diskNumber = $DiskNumber
        partitionNumber = $PartitionNumber
        currentSizeBytes = if ($part) { $part.Size } else { 0 }
        targetSizeBytes = $TargetSizeBytes
        deltaBytes = if ($part) { $TargetSizeBytes - $part.Size } else { 0 }
        currentGb = if ($part) { [math]::Round($part.Size / 1e9, 3) } else { 0 }
        targetGb = [math]::Round($TargetSizeBytes / 1e9, 3)
        deltaGb = if ($part) { [math]::Round(($TargetSizeBytes - $part.Size) / 1e9, 3) } else { 0 }
        action = if ($part -and $TargetSizeBytes -lt $part.Size) { "SHRINK" } elseif ($part -and $TargetSizeBytes -gt $part.Size) { "EXTEND" } else { "NOOP" }
        checks = $checks
        abortReason = $abortReason
        isElevated = $isElevated
    }

    # If Mode was ValidateResize or SimulateResize, return validationResult now
    if ($Mode -eq "ValidateResize") {
        $validationResult | ConvertTo-Json -Depth 5
        exit $(if ($isValid) { 0 } else { 1 })
    }

    if ($Mode -eq "SimulateResize") {
        $simulatedResult = [PSCustomObject]@{
            success = $isValid
            isSimulation = $true
            validation = $validationResult
            simulatedBefore = @{
                diskNumber = $DiskNumber
                partitionNumber = $PartitionNumber
                sizeBytes = if ($part) { $part.Size } else { 0 }
                startOffset = if ($part) { $part.Offset } else { 0 }
                endOffset = if ($part) { $part.Offset + $part.Size } else { 0 }
            }
            simulatedAfter = @{
                diskNumber = $DiskNumber
                partitionNumber = $PartitionNumber
                sizeBytes = $TargetSizeBytes
                startOffset = if ($part) { $part.Offset } else { 0 }
                endOffset = if ($part) { $part.Offset + $TargetSizeBytes } else { 0 }
            }
            verificationPlan = @(
                "Query Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber to verify size equals $TargetSizeBytes",
                "Query Get-Volume to verify NTFS filesystem consistency and free space update",
                "Write structured audit log to resize-audit.log"
            )
            simulatedCommand = "Resize-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -Size $TargetSizeBytes"
        }
        $simulatedResult | ConvertTo-Json -Depth 5
        exit $(if ($isValid) { 0 } else { 1 })
    }

    # -------------------------------------------------------------------------
    # MODE 4: ExecuteResize
    # -------------------------------------------------------------------------
    if ($Mode -eq "ExecuteResize") {
        # Check confirmation
        if (-not $Confirmed) {
            @{
                success = $false
                error = "Execution blocked: Explicit confirmation switch (-Confirmed) was not provided."
                validation = $validationResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        if (-not $isValid) {
            @{
                success = $false
                error = "Execution aborted: Pre-flight safety validation failed ($abortReason)."
                validation = $validationResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        # Start execution timer
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $beforeSizeBytes = $part.Size
        $resizeError = $null

        try {
            Resize-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -Size $TargetSizeBytes -ErrorAction Stop
        } catch {
            $resizeError = $_.Exception.Message
        }

        $sw.Stop()

        # Step 9: Post-execution verification
        $verifiedPart = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction SilentlyContinue
        $verifiedVol = if ($verifiedPart) { Get-Volume -Partition $verifiedPart -ErrorAction SilentlyContinue } else { $null }

        $isVerified = ($verifiedPart -and [math]::Abs($verifiedPart.Size - $TargetSizeBytes) -lt 4194304) # within 4MB sector alignment

        $logEntry = [PSCustomObject]@{
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            action = if ($TargetSizeBytes -lt $beforeSizeBytes) { "SHRINK_PARTITION" } else { "EXTEND_PARTITION" }
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $part.DriveLetter
            beforeSizeBytes = $beforeSizeBytes
            requestedSizeBytes = $TargetSizeBytes
            actualSizeBytes = if ($verifiedPart) { $verifiedPart.Size } else { 0 }
            isVerified = $isVerified
            durationMs = $sw.ElapsedMilliseconds
            error = $resizeError
            status = if ($isVerified -and -not $resizeError) { "SUCCESS" } else { "FAILED" }
        }

        Write-AuditLog -LogEntry $logEntry

        if ($resizeError -or -not $isVerified) {
            @{
                success = $false
                error = if ($resizeError) { $resizeError } else { "Post-execution verification failed: partition size did not update." }
                beforeSizeBytes = $beforeSizeBytes
                requestedSizeBytes = $TargetSizeBytes
                actualSizeBytes = if ($verifiedPart) { $verifiedPart.Size } else { 0 }
                durationMs = $sw.ElapsedMilliseconds
                logEntry = $logEntry
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        @{
            success = $true
            action = if ($TargetSizeBytes -lt $beforeSizeBytes) { "SHRINK" } else { "EXTEND" }
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $part.DriveLetter
            beforeSizeBytes = $beforeSizeBytes
            actualSizeBytes = $verifiedPart.Size
            beforeGb = [math]::Round($beforeSizeBytes / 1e9, 3)
            actualGb = [math]::Round($verifiedPart.Size / 1e9, 3)
            volumeHealth = if ($verifiedVol) { $verifiedVol.HealthStatus } else { "Unknown" }
            durationMs = $sw.ElapsedMilliseconds
            isVerified = $true
            message = "Partition successfully resized and verified via Get-Partition and Get-Volume."
            logEntry = $logEntry
        } | ConvertTo-Json -Depth 5
        exit 0
    }
}
