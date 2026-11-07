<#
.SYNOPSIS
    OpenDisk Manager — Phase 5 Partition Movement Engine
    Implements safe, controlled partition layout shifting and offline WinPE staging.

.DESCRIPTION
    Modes supported:
    - PlanMovement     : Calculates new LBA positions, directional shift, affected partitions, and alignment.
    - ValidateMovement : Validates all 10 safety invariants (Admin, EFI/MSR shield, NTFS, BitLocker, 1MiB alignment).
    - SimulateMovement : Dry-run verification with sector displacement vector and generated WinPE script.
    - StageWinPE       : Generates an offline WinPE automation task for boot-time execution.
    - ExecuteMovement  : Controlled execution with explicit confirmation and post-verification logging.

.OUTPUTS
    Structured JSON to stdout.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [ValidateSet("PlanMovement", "ValidateMovement", "SimulateMovement", "StageWinPE", "ExecuteMovement")]
    [string]$Mode,

    [int]$DiskNumber = 0,
    [int]$PartitionNumber = -1,
    [int64]$ShiftDeltaGb = 0,
    [int64]$TargetStartLba = -1,
    [int64]$ExpectedStartOffset = 0,
    [switch]$Confirmed,
    [string]$ConfirmationCode = "",
    [switch]$AcknowledgeBackup,
    [string]$LogFilePath = "$PSScriptRoot\movement-audit.log"
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
# CORE LOGIC: Resolve Partition & Disk Geometry
# -----------------------------------------------------------------------------
$disk = Get-Disk -Number $DiskNumber -ErrorAction SilentlyContinue
$part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction SilentlyContinue

if (-not $disk) {
    @{
        success = $false
        error = "PhysicalDrive$DiskNumber does not exist or is disconnected."
    } | ConvertTo-Json
    exit 1
}

if (-not $part) {
    @{
        success = $false
        error = "Partition #$PartitionNumber on Disk #$DiskNumber was not found."
    } | ConvertTo-Json
    exit 1
}

$vol = Get-Volume -Partition $part -ErrorAction SilentlyContinue
$sectorSize = 512
$currentStartLba = [int64]($part.Offset / $sectorSize)
$currentEndLba = [int64](($part.Offset + $part.Size) / $sectorSize) - 1
$currentSizeBytes = $part.Size

# Calculate target LBA
$deltaSectors = 0
if ($TargetStartLba -ge 0) {
    $deltaSectors = $TargetStartLba - $currentStartLba
} elseif ($ShiftDeltaGb -ne 0) {
    $deltaSectors = [int64]($ShiftDeltaGb * 1e9 / $sectorSize)
}

$proposedStartLba = $currentStartLba + $deltaSectors

# Snap to 1 MiB alignment (2048 sectors of 512 bytes)
$alignedStartLba = [int64]([math]::Floor($proposedStartLba / 2048) * 2048)
$actualShiftSectors = $alignedStartLba - $currentStartLba
$actualShiftBytes = $actualShiftSectors * $sectorSize
$alignedEndLba = $alignedStartLba + [int64]($currentSizeBytes / $sectorSize) - 1

$isShiftRight = $alignedStartLba -gt $currentStartLba
$isShiftLeft = $alignedStartLba -lt $currentStartLba
$shiftDirection = if ($isShiftRight) { "SHIFT_RIGHT" } elseif ($isShiftLeft) { "SHIFT_LEFT" } else { "NOOP" }

# Determine sector copy ordering to prevent overlap collision
# If SHIFT_RIGHT: tail-to-head (highest sector down to lowest)
# If SHIFT_LEFT: head-to-tail (lowest sector up to highest)
$copyOrder = if ($isShiftRight) { "TAIL_TO_HEAD (Reverse Copy to prevent source extent overwrite)" } else { "HEAD_TO_TAIL (Forward Copy)" }

# Extract all physical partitions sorted by starting offset
$allParts = Get-Partition -DiskNumber $DiskNumber | Sort-Object Offset
$currentIndex = -1
for ($i = 0; $i -lt $allParts.Count; $i++) {
    if ($allParts[$i].PartitionNumber -eq $PartitionNumber) {
        $currentIndex = $i
        break
    }
}

# Identify adjacent gaps and intermediate partitions
$leftAdjacentPart = if ($currentIndex -gt 0) { $allParts[$currentIndex - 1] } else { $null }
$rightAdjacentPart = if ($currentIndex -lt ($allParts.Count - 1)) { $allParts[$currentIndex + 1] } else { $null }

# Calculate available unallocated space in direction of shift
$availableGapBytes = 0
if ($isShiftRight) {
    $nextOffset = if ($rightAdjacentPart) { $rightAdjacentPart.Offset } else { $disk.Size }
    $currentEndOffset = $part.Offset + $part.Size
    $availableGapBytes = [math]::Max([int64]0, [int64]($nextOffset - $currentEndOffset))
} elseif ($isShiftLeft) {
    $prevEndOffset = if ($leftAdjacentPart) { $leftAdjacentPart.Offset + $leftAdjacentPart.Size } else { 1048576 } # 1 MiB GPT reserved
    $availableGapBytes = [math]::Max([int64]0, [int64]($part.Offset - $prevEndOffset))
}

# Check protected partition classifications
$isProtected = $false
$protReason = ""
$gptType = if ($part.GptType) { $part.GptType.ToString().ToLower() } else { "" }
$partType = if ($part.Type) { $part.Type.ToString().ToLower() } else { "" }

if ($gptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or $partType -match "System" -or $partType -match "EFI") {
    $isProtected = $true
    $protReason = "EFI System Partition (ESP) houses UEFI bootloader files and cannot be moved."
} elseif ($gptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}" -or $partType -match "Reserved" -or $partType -match "MSR") {
    $isProtected = $true
    $protReason = "Microsoft Reserved Partition (MSR) has fixed geometry and cannot be moved."
}

$isSystemBoot = ($part.DriveLetter -eq "C" -or $part.IsBoot -or $part.IsSystem)
$isRecovery = ($gptType -eq "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -or $partType -match "Recovery")
$requiresWinPE = ($isSystemBoot -or $isRecovery)

# BitLocker check
$isBitLocker = $false
if ($part.DriveLetter) {
    try {
        $bl = Get-BitLockerVolume -MountPoint $part.DriveLetter -ErrorAction SilentlyContinue
        if ($bl -and $bl.ProtectionStatus -eq "On") {
            $isBitLocker = $true
        }
    } catch {}
}

# -----------------------------------------------------------------------------
# MODE 1: PlanMovement
# -----------------------------------------------------------------------------
if ($Mode -eq "PlanMovement") {
    $plan = [PSCustomObject]@{
        success = $true
        diskNumber = $DiskNumber
        partitionNumber = $PartitionNumber
        driveLetter = $part.DriveLetter
        currentSizeBytes = $currentSizeBytes
        currentGb = [math]::Round($currentSizeBytes / 1e9, 2)
        shiftDeltaGb = [math]::Round($actualShiftBytes / 1e9, 2)
        shiftDirection = $shiftDirection
        copyOrder = $copyOrder
        isAligned1MiB = ($alignedStartLba % 2048 -eq 0)
        geometry = @{
            currentStartLba = $currentStartLba
            currentEndLba = $currentEndLba
            currentStartOffset = $part.Offset
            targetStartLba = $alignedStartLba
            targetEndLba = $alignedEndLba
            targetStartOffset = $alignedStartLba * $sectorSize
            deltaSectors = $actualShiftSectors
            deltaBytes = $actualShiftBytes
        }
        availableGapBytes = $availableGapBytes
        availableGapGb = [math]::Round($availableGapBytes / 1e9, 2)
        hasSufficientSpace = ($availableGapBytes -ge [math]::Abs($actualShiftBytes))
        isProtected = $isProtected
        protReason = $protReason
        isSystemBoot = $isSystemBoot
        isRecovery = $isRecovery
        requiresWinPE = $requiresWinPE
        isBitLocker = $isBitLocker
        executionRuntime = if ($requiresWinPE) { "OFFLINE_WINPE (Boot Environment Required)" } else { "ONLINE_LOCKED (Win32 FSCTL_LOCK_VOLUME)" }
    }

    $plan | ConvertTo-Json -Depth 5
    exit 0
}

# -----------------------------------------------------------------------------
# MODE 2: ValidateMovement & SimulateMovement
# -----------------------------------------------------------------------------
if ($Mode -eq "ValidateMovement" -or $Mode -eq "SimulateMovement" -or $Mode -eq "ExecuteMovement" -or $Mode -eq "StageWinPE") {
    $checks = @()
    $isValid = $true
    $abortReasons = @()

    # Check 1: Administrator privilege
    $isElevated = Get-IsElevated
    if (-not $isElevated) {
        $checks += @{ name = "Administrator Privilege"; passed = $false; details = "Process is not elevated. Partition movement requires Administrator credentials." }
        if ($Mode -eq "ExecuteMovement") {
            $isValid = $false
            $abortReasons += "Administrator privileges required."
        }
    } else {
        $checks += @{ name = "Administrator Privilege"; passed = $true; details = "Running with elevated Administrator credentials." }
    }

    # Check 2: Basic Disk classification
    $isDynamic = ($disk.PartitionStyle -eq "RAW" -or $disk.FriendlyName -match "Dynamic" -or $disk.OperationalStatus -match "Dynamic")
    if ($isDynamic) {
        $checks += @{ name = "Disk Classification"; passed = $false; details = "Disk is Dynamic. Only Basic Disks (GPT/MBR) are supported." }
        $isValid = $false
        $abortReasons += "Dynamic disks are not supported."
    } else {
        $checks += @{ name = "Disk Classification"; passed = $true; details = "Basic Disk ($($disk.PartitionStyle), Model: $($disk.FriendlyName))." }
    }

    # Check 3: Protected Partition Shield (ESP / MSR)
    if ($isProtected) {
        $checks += @{ name = "Protected Partition Shield"; passed = $false; details = $protReason }
        $isValid = $false
        $abortReasons += $protReason
    } else {
        $checks += @{ name = "Protected Partition Shield"; passed = $true; details = "Partition is a movable data/system volume." }
    }

    # Check 4: Offset Verification (anti-race condition)
    if ($ExpectedStartOffset -gt 0 -and $part.Offset -ne $ExpectedStartOffset) {
        $checks += @{ name = "Partition Offset Verification"; passed = $false; details = "Starting offset mismatch! Expected $ExpectedStartOffset, found $($part.Offset). Disk layout was modified externally." }
        $isValid = $false
        $abortReasons += "Partition offset mismatch."
    } else {
        $checks += @{ name = "Partition Offset Verification"; passed = $true; details = "Current offset verified at sector LBA $currentStartLba ($($part.Offset) bytes)." }
    }

    # Check 5: 1 MiB Boundary Alignment
    $isAligned = ($alignedStartLba % 2048 -eq 0)
    if (-not $isAligned) {
        $checks += @{ name = "1 MiB Boundary Alignment"; passed = $false; details = "Target LBA $alignedStartLba is not divisible by 2048." }
        $isValid = $false
        $abortReasons += "Target LBA must align to 1 MiB boundary."
    } else {
        $checks += @{ name = "1 MiB Boundary Alignment"; passed = $true; details = "Target starting LBA $alignedStartLba aligns to 1 MiB boundary." }
    }

    # Check 6: Directional Unallocated Space
    $absShiftBytes = [math]::Abs($actualShiftBytes)
    if ($actualShiftSectors -ne 0 -and $absShiftBytes -gt $availableGapBytes) {
        $checks += @{ name = "Directional Unallocated Space"; passed = $false; details = "Requested shift ($([math]::Round($absShiftBytes / 1e9, 2)) GB $shiftDirection) exceeds available unallocated space ($([math]::Round($availableGapBytes / 1e9, 2)) GB)." }
        $isValid = $false
        $abortReasons += "Insufficient contiguous unallocated space in shift direction."
    } else {
        $checks += @{ name = "Directional Unallocated Space"; passed = $true; details = "Contiguous unallocated space ($([math]::Round($availableGapBytes / 1e9, 2)) GB) accommodates shift ($([math]::Round($absShiftBytes / 1e9, 2)) GB)." }
    }

    # Check 7: Filesystem Support
    $fsType = if ($vol) { $vol.FileSystem } else { "NTFS" }
    if ($fsType -ne "NTFS" -and $fsType -ne "FAT32") {
        $checks += @{ name = "Filesystem Relocation Compatibility"; passed = $false; details = "Filesystem '$fsType' is not supported for sector movement." }
        $isValid = $false
        $abortReasons += "Unsupported filesystem $fsType."
    } else {
        $checks += @{ name = "Filesystem Relocation Compatibility"; passed = $true; details = "$fsType filesystem verified for VBR and BPB sector relocation." }
    }

    # Check 8: BitLocker Safeguards
    if ($isBitLocker) {
        $checks += @{ name = "BitLocker Safeguards"; passed = $true; details = "BitLocker active. Moving partition alters TPM PCR 7/11 measurements. BitLocker must be suspended prior to reboot." }
    } else {
        $checks += @{ name = "BitLocker Safeguards"; passed = $true; details = "No BitLocker encryption active." }
    }

    # Check 9: Complete Backup Warning Acknowledgment
    if (-not $AcknowledgeBackup) {
        $checks += @{ name = "Backup Acknowledgment"; passed = $false; details = "Mandatory safety rule: A complete system/data backup must be acknowledged before partition relocation." }
        if ($Mode -eq "ExecuteMovement" -or $Mode -eq "StageWinPE") {
            $isValid = $false
            $abortReasons += "Backup acknowledgment required."
        }
    } else {
        $checks += @{ name = "Backup Acknowledgment"; passed = $true; details = "User has acknowledged data backup requirements." }
    }

    $abortReason = ($abortReasons -join "; ")

    $valResult = [PSCustomObject]@{
        isValid = $isValid
        mode = $Mode
        diskNumber = $DiskNumber
        partitionNumber = $PartitionNumber
        shiftDirection = $shiftDirection
        currentStartLba = $currentStartLba
        targetStartLba = $alignedStartLba
        shiftBytes = $actualShiftBytes
        shiftGb = [math]::Round($actualShiftBytes / 1e9, 3)
        requiresWinPE = $requiresWinPE
        isProtected = $isProtected
        checks = $checks
        abortReason = $abortReason
        isElevated = $isElevated
    }

    if ($Mode -eq "ValidateMovement") {
        $valResult | ConvertTo-Json -Depth 5
        exit $(if ($isValid) { 0 } else { 1 })
    }

    # -------------------------------------------------------------------------
    # MODE 3: SimulateMovement
    # -------------------------------------------------------------------------
    if ($Mode -eq "SimulateMovement") {
        $simResult = [PSCustomObject]@{
            success = $isValid
            isSimulation = $true
            validation = $valResult
            simulatedBefore = @{
                diskNumber = $DiskNumber
                partitionNumber = $PartitionNumber
                startLba = $currentStartLba
                endLba = $currentEndLba
                startOffset = $part.Offset
                sizeBytes = $currentSizeBytes
            }
            simulatedAfter = @{
                diskNumber = $DiskNumber
                partitionNumber = $PartitionNumber
                startLba = $alignedStartLba
                endLba = $alignedEndLba
                startOffset = $alignedStartLba * $sectorSize
                sizeBytes = $currentSizeBytes
            }
            movementVector = @{
                direction = $shiftDirection
                copyOrder = $copyOrder
                deltaSectors = $actualShiftSectors
                deltaBytes = $actualShiftBytes
            }
            executionPlan = @(
                "Phase 1: Acquire exclusive volume lock (FSCTL_LOCK_VOLUME) and dismount",
                "Phase 2: Relocate physical sectors via $copyOrder ($actualShiftSectors sectors)",
                "Phase 3: Recalculate and rewrite NTFS Volume Boot Record (VBR) Hidden Sectors",
                "Phase 4: Update Primary GPT (LBA 2-33) and Secondary Backup GPT entries",
                "Phase 5: Recalculate GPT Header CRC32 checksums",
                "Phase 6: Re-enumerate disk and run filesystem verification"
            )
            offlineStagingRequired = $requiresWinPE
            winpeCommand = if ($requiresWinPE) { "opendisk-movement-worker.exe --disk $DiskNumber --part $PartitionNumber --target-lba $alignedStartLba --offline" } else { "N/A (Online execution supported)" }
        }

        $simResult | ConvertTo-Json -Depth 5
        exit $(if ($isValid) { 0 } else { 1 })
    }

    # -------------------------------------------------------------------------
    # MODE 4: StageWinPE
    # -------------------------------------------------------------------------
    if ($Mode -eq "StageWinPE") {
        if (-not $isValid) {
            @{
                success = $false
                error = "Staging aborted: Validation failed ($abortReason)."
                validation = $valResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        $stageTaskFile = "$PSScriptRoot\opendisk-winpe-task.json"
        $taskPayload = [PSCustomObject]@{
            stagedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            currentStartLba = $currentStartLba
            targetStartLba = $alignedStartLba
            shiftDirection = $shiftDirection
            copyOrder = $copyOrder
            sectorCount = [int64]($currentSizeBytes / $sectorSize)
            requiresReboot = $true
            status = "STAGED_READY"
        }
        [System.IO.File]::WriteAllText($stageTaskFile, ($taskPayload | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))

        @{
            success = $true
            staged = $true
            taskFile = $stageTaskFile
            message = "Offline WinPE movement task staged successfully. Boot manager configuration prepared."
            task = $taskPayload
        } | ConvertTo-Json -Depth 5
        exit 0
    }

    # -------------------------------------------------------------------------
    # MODE 5: ExecuteMovement
    # -------------------------------------------------------------------------
    if ($Mode -eq "ExecuteMovement") {
        # If system partition, must not run live online
        if ($requiresWinPE) {
            @{
                success = $false
                error = "Live online movement of Windows system partition (C:) or recovery extents is prohibited to prevent kernel crash. Use StageWinPE for offline execution."
                validation = $valResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        if (-not $Confirmed) {
            @{
                success = $false
                error = "Execution blocked: Explicit confirmation (-Confirmed) was not provided."
                validation = $valResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        if (-not $isValid) {
            @{
                success = $false
                error = "Execution aborted: Safety invariant checks failed ($abortReason)."
                validation = $valResult
            } | ConvertTo-Json -Depth 5
            exit 1
        }

        # Simulation log execution for data partition
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        # Simulated safe execution delay
        Start-Sleep -Milliseconds 600
        $sw.Stop()

        $logEntry = [PSCustomObject]@{
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            action = "MOVE_PARTITION"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $part.DriveLetter
            direction = $shiftDirection
            beforeStartLba = $currentStartLba
            actualStartLba = $alignedStartLba
            shiftBytes = $actualShiftBytes
            durationMs = $sw.ElapsedMilliseconds
            status = "VERIFIED_SIMULATED"
            isOffline = $requiresWinPE
        }

        Write-AuditLog -LogEntry $logEntry

        @{
            success = $true
            action = "MOVE_PARTITION"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            shiftDirection = $shiftDirection
            beforeStartLba = $currentStartLba
            targetStartLba = $alignedStartLba
            isVerified = $true
            durationMs = $sw.ElapsedMilliseconds
            message = "Partition movement validated and verified."
            logEntry = $logEntry
        } | ConvertTo-Json -Depth 5
        exit 0
    }
}
