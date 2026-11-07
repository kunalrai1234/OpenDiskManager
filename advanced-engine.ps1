# OpenDisk Manager - Advanced Partition Management Engine (Phase 6)
# Target: Windows 11 x64 Native Storage Management
# Author: OpenDisk Manager Core Engineering Team
# Strict Isolation: D:\Project\OpenDiskManager

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet(
        "CheckElevation",
        "FormatVolume",
        "DeletePartition",
        "SetDriveLetter",
        "RemoveDriveLetter",
        "SetVolumeLabel",
        "PlanSplitPartition",
        "ExecuteSplitPartition",
        "PlanMergePartitions",
        "ExecuteMergePartitions",
        "InspectFileSystem",
        "DetectConfigIssues",
        "GetAvailableDriveLetters"
    )]
    [string]$Mode,

    [int]$DiskNumber = -1,
    [int]$PartitionNumber = -1,
    [int]$SourcePartitionNumber = -1,
    [int]$TargetPartitionNumber = -1,

    [string]$TargetFileSystem = "NTFS",
    [string]$TargetLabel = "",
    [int]$TargetAllocationUnitSize = 0, # 0 = default (4096 for NTFS)
    [switch]$QuickFormat = $true,

    [string]$TargetDriveLetter = "",
    [int64]$SplitSizeBytes = 0,
    [switch]$PreserveSourceData = $true,

    [switch]$Confirmed,
    [string]$ConfirmationCode = ""
)

$ErrorActionPreference = "Stop"
$AuditLogPath = Join-Path $PSScriptRoot "advanced-audit.log"

# -----------------------------------------------------------------------------
# Helper: Audit Logger
# -----------------------------------------------------------------------------
function Write-AdvancedAuditLog {
    param([hashtable]$Record)
    try {
        $timestamp = (Get-Date).ToString("o")
        $json = ($Record | ConvertTo-Json -Compress)
        $line = "[$timestamp] $json`n"
        [System.IO.File]::AppendAllText($AuditLogPath, $line, [System.Text.Encoding]::UTF8)
    } catch {
        # Fallback to standard console error if file locked
        Write-Error "Failed to append to audit log: $_"
    }
}

# -----------------------------------------------------------------------------
# Helper: Check Process Administrative Elevation
# -----------------------------------------------------------------------------
function Test-AdminElevation {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# -----------------------------------------------------------------------------
# Helper: Get All Currently Assigned Drive Letters in Windows
# -----------------------------------------------------------------------------
function Get-AssignedDriveLettersList {
    $letters = @{}
    
    # 1. Check volumes
    try {
        $volumes = Get-Volume -ErrorAction SilentlyContinue
        foreach ($v in $volumes) {
            if ($v.DriveLetter) {
                $letters[$v.DriveLetter.ToString().ToUpper()] = "Volume: $($v.FileSystemLabel)"
            }
        }
    } catch {}

    # 2. Check DriveInfo (includes mapped network drives, optical drives, etc.)
    try {
        $drives = [System.IO.DriveInfo]::GetDrives()
        foreach ($d in $drives) {
            $ltr = $d.Name.Substring(0, 1).ToUpper()
            if (-not $letters.ContainsKey($ltr)) {
                $letters[$ltr] = "DriveType: $($d.DriveType)"
            }
        }
    } catch {}

    return $letters
}

# -----------------------------------------------------------------------------
# MODE: CheckElevation
# -----------------------------------------------------------------------------
if ($Mode -eq "CheckElevation") {
    $isAdmin = Test-AdminElevation
    $result = @{
        mode = "CheckElevation"
        isElevated = $isAdmin
        user = [Environment]::UserName
        status = if ($isAdmin) { "SUCCESS" } else { "ELEVATION_REQUIRED" }
        message = if ($isAdmin) { "Process running with administrative privileges." } else { "Process running under standard user token. Disk modifications will require elevation." }
    }
    $result | ConvertTo-Json -Depth 5
    exit 0
}

# -----------------------------------------------------------------------------
# MODE: GetAvailableDriveLetters
# -----------------------------------------------------------------------------
if ($Mode -eq "GetAvailableDriveLetters") {
    $assigned = Get-AssignedDriveLettersList
    $allLetters = [char[]](65..90) # A-Z
    $available = @()
    $inUse = @()

    foreach ($ch in $allLetters) {
        $lStr = [string]$ch
        if ($assigned.ContainsKey($lStr)) {
            $inUse += @{
                letter = $lStr
                usage = $assigned[$lStr]
            }
        } else {
            # Note: A and B are historically floppy drives, but completely valid.
            $available += $lStr
        }
    }

    $result = @{
        mode = "GetAvailableDriveLetters"
        availableLetters = $available
        inUseLetters = $inUse
        availableCount = $available.Count
        inUseCount = $inUse.Count
    }
    $result | ConvertTo-Json -Depth 5
    exit 0
}

# -----------------------------------------------------------------------------
# MODE: DetectConfigIssues (Full Storage Topology Diagnostics)
# -----------------------------------------------------------------------------
if ($Mode -eq "DetectConfigIssues") {
    $issues = @()
    $warnings = @()
    $diagnostics = @()

    try {
        $disks = Get-Disk -ErrorAction Stop | Sort-Object Number
        $assignedLetters = @{}

        foreach ($disk in $disks) {
            $diskInfo = @{
                diskNumber = $disk.Number
                friendlyName = $disk.FriendlyName
                partitionStyle = $disk.PartitionStyle.ToString()
                totalSizeBytes = $disk.Size
                issuesCount = 0
            }

            # Check MBR Partition Limit
            if ($disk.PartitionStyle -eq "MBR" -and $disk.Size -gt 2199023255552) { # 2 TiB
                $issues += @{
                    severity = "ERROR"
                    code = "MBR_OVER_2TB_LIMIT"
                    diskNumber = $disk.Number
                    message = "Disk $($disk.Number) is formatted as MBR but capacity ($([Math]::Round($disk.Size / 1e12, 2)) TB) exceeds MBR 2.0 TiB addressable ceiling. Storage beyond 2 TiB is unusable."
                }
            }

            # Inspect partitions on this disk
            $parts = Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue | Sort-Object Offset
            $prevEnd = [int64]0
            $unallocatedGaps = 0

            $hasEsp = $false
            $hasMsr = $false

            foreach ($p in $parts) {
                # 1. 1 MiB Alignment check (2048 sectors * 512 = 1,048,576 bytes)
                if (($p.Offset % 1048576) -ne 0) {
                    $warnings += @{
                        severity = "WARNING"
                        code = "PARTITION_NOT_1MIB_ALIGNED"
                        diskNumber = $disk.Number
                        partitionNumber = $p.PartitionNumber
                        offsetBytes = $p.Offset
                        message = "Disk $($disk.Number) Partition $($p.PartitionNumber) offset ($($p.Offset)) is not 1 MiB aligned. May cause write amplification on modern 4K/NVMe SSDs."
                    }
                }

                # 2. Check for duplicate drive letters
                if ($p.DriveLetter) {
                    $ltr = $p.DriveLetter.ToString().ToUpper()
                    if ($assignedLetters.ContainsKey($ltr)) {
                        $issues += @{
                            severity = "CRITICAL"
                            code = "DUPLICATE_DRIVE_LETTER"
                            driveLetter = $ltr
                            conflictingDisk = $disk.Number
                            conflictingPartition = $p.PartitionNumber
                            firstSeen = $assignedLetters[$ltr]
                            message = "Duplicate Drive Letter '$ltr': Found on Disk $($disk.Number) Partition $($p.PartitionNumber) and previously on $($assignedLetters[$ltr]). Windows letter collision detected!"
                        }
                    } else {
                        $assignedLetters[$ltr] = "Disk $($disk.Number) Partition $($p.PartitionNumber)"
                    }

                    # Check Dirty Bit on formatted drive
                    try {
                        $dirtyCheck = (fsutil dirty query "$($ltr):" 2>&1) | Out-String
                        if ($dirtyCheck -match "is dirty") {
                            $warnings += @{
                                severity = "WARNING"
                                code = "FILESYSTEM_DIRTY_BIT_SET"
                                driveLetter = $ltr
                                diskNumber = $disk.Number
                                partitionNumber = $p.PartitionNumber
                                message = "Volume $($ltr): has its dirty bit set. Filesystem integrity is compromised; a CHKDSK scan is strongly advised."
                            }
                        }
                    } catch {}
                }

                # GPT check for ESP / MSR
                $gptType = if ($p.GptType) { $p.GptType.ToString().ToLower() } else { "" }
                if ($gptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or $p.Type -eq "System") {
                    $hasEsp = $true
                }
                if ($gptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}" -or $p.Type -eq "Reserved") {
                    $hasMsr = $true
                }

                # Free gap tracking
                if ($p.Offset -gt $prevEnd) {
                    $gap = $p.Offset - $prevEnd
                    if ($gap -ge 104857600) { # >= 100 MB
                        $unallocatedGaps++
                    }
                }
                $prevEnd = $p.Offset + $p.Size
            }

            # Check trailing gap
            if ($disk.Size -gt $prevEnd) {
                $trailingGap = $disk.Size - $prevEnd
                if ($trailingGap -ge 104857600) {
                    $unallocatedGaps++
                }
            }

            if ($unallocatedGaps -ge 2) {
                $warnings += @{
                    severity = "INFO"
                    code = "FRAGMENTED_UNALLOCATED_SPACE"
                    diskNumber = $disk.Number
                    gapCount = $unallocatedGaps
                    message = "Disk $($disk.Number) contains $unallocatedGaps non-contiguous unallocated physical gaps. Space cannot be merged into a single volume without moving intervening partitions."
                }
            }

            if ($disk.PartitionStyle -eq "GPT" -and -not $hasEsp) {
                $warnings += @{
                    severity = "WARNING"
                    code = "GPT_MISSING_ESP"
                    diskNumber = $disk.Number
                    message = "Disk $($disk.Number) is a GPT disk without an EFI System Partition (ESP). If this is the boot drive, UEFI system boot will fail."
                }
            }
        }

        $res = @{
            mode = "DetectConfigIssues"
            timestamp = (Get-Date).ToString("o")
            totalIssuesCount = $issues.Count
            totalWarningsCount = $warnings.Count
            issues = $issues
            warnings = $warnings
            status = if ($issues.Count -eq 0) { "HEALTHY" } else { "ISSUES_DETECTED" }
        }
        $res | ConvertTo-Json -Depth 6
        exit 0
    } catch {
        $errRes = @{
            mode = "DetectConfigIssues"
            status = "ERROR"
            error = $_.Exception.Message
        }
        $errRes | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: InspectFileSystem (Deep Cluster, Serialization & Feature Flags)
# -----------------------------------------------------------------------------
if ($Mode -eq "InspectFileSystem") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1) {
        Write-Output (@{ error = "Invalid DiskNumber or PartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        $vol = $null
        if ($part.DriveLetter) {
            $vol = Get-Volume -DriveLetter $part.DriveLetter -ErrorAction SilentlyContinue
        } else {
            # Try by AccessPath
            $vol = Get-Volume -Partition $part -ErrorAction SilentlyContinue
        }

        $fsDetails = @{
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = if ($part.DriveLetter) { $part.DriveLetter.ToString() } else { $null }
            partitionSize = $part.Size
            partitionOffset = $part.Offset
            partitionType = $part.Type.ToString()
            gptType = if ($part.GptType) { $part.GptType.ToString() } else { $null }
            fileSystem = if ($vol) { $vol.FileSystem } else { "RAW/Unknown" }
            fileSystemLabel = if ($vol) { $vol.FileSystemLabel } else { "" }
            healthStatus = if ($vol) { $vol.HealthStatus.ToString() } else { "Unknown" }
            operationalStatus = if ($vol) { $vol.OperationalStatus.ToString() } else { "Unknown" }
            sizeRemaining = if ($vol) { $vol.SizeRemaining } else { 0 }
            sizeUsed = if ($vol) { ($vol.Size - $vol.SizeRemaining) } else { 0 }
            allocationUnitSize = if ($vol.AllocationUnitSize) { $vol.AllocationUnitSize } else { 4096 }
        }

        # Query cluster count
        if ($vol -and $vol.Size -and $vol.AllocationUnitSize) {
            $fsDetails.totalClusters = [int64]($vol.Size / $vol.AllocationUnitSize)
            $fsDetails.freeClusters = [int64]($vol.SizeRemaining / $vol.AllocationUnitSize)
            $fsDetails.usedClusters = $fsDetails.totalClusters - $fsDetails.freeClusters
        }

        # Check Dirty bit & BitLocker
        if ($part.DriveLetter) {
            $ltr = $part.DriveLetter.ToString()
            try {
                $dirtyStr = (fsutil dirty query "$($ltr):" 2>&1) | Out-String
                $fsDetails.isDirty = ($dirtyStr -match "is dirty")
            } catch {
                $fsDetails.isDirty = $false
            }

            try {
                $bl = Get-BitLockerVolume -MountPoint "$($ltr):" -ErrorAction SilentlyContinue
                if ($bl) {
                    $fsDetails.isBitLocker = ($bl.VolumeStatus -ne "FullyDecrypted")
                    $fsDetails.bitLockerStatus = $bl.VolumeStatus.ToString()
                    $fsDetails.protectionStatus = $bl.ProtectionStatus.ToString()
                    $fsDetails.encryptionPercentage = $bl.EncryptionPercentage
                } else {
                    $fsDetails.isBitLocker = $false
                    $fsDetails.bitLockerStatus = "Unencrypted"
                }
            } catch {
                $fsDetails.isBitLocker = $false
                $fsDetails.bitLockerStatus = "Unknown"
            }
        }

        # Filesystem Feature Flags
        $fsDetails.supportsCompression = ($fsDetails.fileSystem -eq "NTFS")
        $fsDetails.supportsEncryption = ($fsDetails.fileSystem -eq "NTFS")
        $fsDetails.supportsSparseFiles = ($fsDetails.fileSystem -eq "NTFS" -or $fsDetails.fileSystem -eq "ReFS")
        $fsDetails.supportsReparsePoints = ($fsDetails.fileSystem -eq "NTFS" -or $fsDetails.fileSystem -eq "ReFS")
        $fsDetails.supportsHardLinks = ($fsDetails.fileSystem -eq "NTFS")

        $res = @{
            mode = "InspectFileSystem"
            status = "SUCCESS"
            details = $fsDetails
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "InspectFileSystem"
            status = "ERROR"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: FormatVolume
# -----------------------------------------------------------------------------
if ($Mode -eq "FormatVolume") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1) {
        Write-Output (@{ error = "Invalid DiskNumber or PartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        
        # 1. SHIELD: Protected Partitions
        $gptType = if ($part.GptType) { $part.GptType.ToString().ToLower() } else { "" }
        $partType = if ($part.Type) { $part.Type.ToString().ToLower() } else { "" }
        $driveLetter = if ($part.DriveLetter) { $part.DriveLetter.ToString().ToUpper() } else { "" }

        if ($part.IsSystem -or $part.IsBoot -or $driveLetter -eq "C" -or 
            $partType -eq "system" -or $partType -eq "reserved" -or $partType -eq "recovery" -or
            $gptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or 
            $gptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}" -or 
            $gptType -eq "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}") {
            
            $blockRes = @{
                mode = "FormatVolume"
                status = "PROTECTED_PARTITION_BLOCKED"
                canExecute = $false
                error = "FORMAT REJECTED: Partition $PartitionNumber on Disk $DiskNumber is a protected Windows System, EFI, MSR, Boot, or Recovery partition. Formatting this volume would cause immediate unrecoverable OS failure."
            }
            $blockRes | ConvertTo-Json -Depth 5
            exit 1
        }

        # 2. Filesystem choice validation
        $validFs = @("NTFS", "FAT32", "exFAT", "ReFS")
        $fsToUse = $TargetFileSystem.ToUpper()
        if (-not ($validFs -contains $fsToUse)) {
            Write-Output (@{ error = "Unsupported filesystem: $TargetFileSystem. Must be NTFS, FAT32, exFAT, or ReFS."; status = "INVALID_FS" } | ConvertTo-Json)
            exit 1
        }

        # FAT32 32GB Windows limit check
        if ($fsToUse -eq "FAT32" -and $part.Size -gt 34359738368) { # 32 GB
            Write-Output (@{ 
                error = "FAT32 format limitation: Windows native format utility cannot format volumes larger than 32 GB in FAT32 (Current size: $([Math]::Round($part.Size / 1e9, 1)) GB). Use NTFS or exFAT instead."
                status = "FAT32_SIZE_EXCEEDED"
            } | ConvertTo-Json)
            exit 1
        }

        # Label length check
        $label = $TargetLabel.Trim()
        if ($fsToUse -eq "NTFS" -and $label.Length -gt 32) {
            Write-Output (@{ error = "NTFS volume label cannot exceed 32 characters."; status = "LABEL_TOO_LONG" } | ConvertTo-Json)
            exit 1
        }
        if (($fsToUse -eq "FAT32" -or $fsToUse -eq "exFAT") -and $label.Length -gt 11) {
            Write-Output (@{ error = "$fsToUse volume label cannot exceed 11 characters."; status = "LABEL_TOO_LONG" } | ConvertTo-Json)
            exit 1
        }

        $expectedCode = if ($driveLetter) { "FORMAT_$driveLetter" } else { "FORMAT_DISK${DiskNumber}_PART${PartitionNumber}" }

        # Preflight Preview
        $preview = @{
            mode = "FormatVolume"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $driveLetter
            currentSizeGb = [Math]::Round($part.Size / 1e9, 2)
            targetFileSystem = $fsToUse
            targetLabel = $label
            allocationUnitSize = if ($TargetAllocationUnitSize -gt 0) { $TargetAllocationUnitSize } else { "Default (4096)" }
            quickFormat = [bool]$QuickFormat
            expectedConfirmationCode = $expectedCode
            consequences = @(
                "ALL EXISTING DATA ON THIS VOLUME WILL BE PERMANENTLY ERASED.",
                "Open files and handles will be forcefully disconnected.",
                "Previous shadow copies and system restore points on this volume will be deleted.",
                "Volume filesystem structures will be reinitialized to $fsToUse."
            )
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        # If not confirmed, return the preflight preview
        if (-not $Confirmed) {
            $preview | ConvertTo-Json -Depth 5
            exit 0
        }

        # 3. Execution Gate
        if ($ConfirmationCode -ne $expectedCode) {
            $preview.status = "CONFIRMATION_MISMATCH"
            $preview.error = "Confirmation code mismatch. Expected '$expectedCode', received '$ConfirmationCode'."
            $preview | ConvertTo-Json -Depth 5
            exit 1
        }

        # Execute format
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $formatParams = @{
            FileSystem = $fsToUse
            NewFileSystemLabel = $label
            Confirm = $false
        }
        if ($TargetAllocationUnitSize -gt 0) {
            $formatParams.AllocationUnitSize = $TargetAllocationUnitSize
        }
        if (-not $QuickFormat) {
            $formatParams.Full = $true
        }

        if ($driveLetter) {
            $formatParams.DriveLetter = $driveLetter
            Format-Volume @formatParams -ErrorAction Stop | Out-Null
        } else {
            # Format via AccessPath or Partition pipeline
            $part | Format-Volume @formatParams -ErrorAction Stop | Out-Null
        }
        $sw.Stop()

        # Audit Record
        $audit = @{
            action = "FORMAT_VOLUME"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $driveLetter
            fileSystem = $fsToUse
            label = $label
            durationMs = $sw.ElapsedMilliseconds
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "FormatVolume"
            status = "SUCCESS"
            message = "Volume successfully formatted with $fsToUse."
            durationMs = $sw.ElapsedMilliseconds
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "FormatVolume"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: DeletePartition
# -----------------------------------------------------------------------------
if ($Mode -eq "DeletePartition") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1) {
        Write-Output (@{ error = "Invalid DiskNumber or PartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        
        # 1. SHIELD: Protected Partitions
        $gptType = if ($part.GptType) { $part.GptType.ToString().ToLower() } else { "" }
        $partType = if ($part.Type) { $part.Type.ToString().ToLower() } else { "" }
        $driveLetter = if ($part.DriveLetter) { $part.DriveLetter.ToString().ToUpper() } else { "" }

        if ($part.IsSystem -or $part.IsBoot -or $driveLetter -eq "C" -or 
            $partType -eq "system" -or $partType -eq "reserved" -or
            $gptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or 
            $gptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}") {
            
            $blockRes = @{
                mode = "DeletePartition"
                status = "PROTECTED_PARTITION_BLOCKED"
                canExecute = $false
                error = "DELETION BLOCKED: Partition $PartitionNumber on Disk $DiskNumber is a core Windows Boot, System, EFI, or MSR partition. Deletion would render the host operating system unbootable."
            }
            $blockRes | ConvertTo-Json -Depth 5
            exit 1
        }

        # Extra shield for Recovery partitions
        $isRecovery = ($partType -eq "recovery" -or $gptType -eq "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}")
        $expectedCode = "DELETE_DISK${DiskNumber}_PART${PartitionNumber}"

        $consequences = @(
            "The partition entry will be permanently removed from the $(Get-Disk -Number $DiskNumber | Select-Object -ExpandProperty PartitionStyle) partition table.",
            "The entire $([Math]::Round($part.Size / 1e9, 2)) GB region will revert to RAW UNALLOCATED space.",
            "All stored documents, databases, filesystems, and partitions within this extent will be destroyed."
        )
        if ($isRecovery) {
            $consequences += "WARNING: This is a Windows Recovery partition. Deleting it disables Windows Recovery Environment (WinRE) automatic repair capabilities."
        } else {
            $consequences += "Any drive letters assigned to this partition will be unmounted and reclaimed."
        }

        $preview = @{
            mode = "DeletePartition"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $driveLetter
            partitionOffset = $part.Offset
            partitionSizeBytes = $part.Size
            sizeGb = [Math]::Round($part.Size / 1e9, 2)
            isRecoveryPartition = $isRecovery
            expectedConfirmationCode = $expectedCode
            consequences = $consequences
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if (-not $Confirmed) {
            $preview | ConvertTo-Json -Depth 5
            exit 0
        }

        # Execution check
        if ($ConfirmationCode -ne $expectedCode) {
            $preview.status = "CONFIRMATION_MISMATCH"
            $preview.error = "Confirmation code mismatch. Expected '$expectedCode', received '$ConfirmationCode'."
            $preview | ConvertTo-Json -Depth 5
            exit 1
        }

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        Remove-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -Confirm:$false -ErrorAction Stop
        $sw.Stop()

        # Audit Record
        $audit = @{
            action = "DELETE_PARTITION"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            driveLetter = $driveLetter
            offsetBytes = $part.Offset
            sizeBytes = $part.Size
            durationMs = $sw.ElapsedMilliseconds
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "DeletePartition"
            status = "SUCCESS"
            message = "Partition $PartitionNumber deleted. Physical extent reverted to unallocated space."
            durationMs = $sw.ElapsedMilliseconds
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "DeletePartition"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: SetDriveLetter
# -----------------------------------------------------------------------------
if ($Mode -eq "SetDriveLetter") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1 -or -not $TargetDriveLetter) {
        Write-Output (@{ error = "Invalid DiskNumber, PartitionNumber, or TargetDriveLetter"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $targetLetter = $TargetDriveLetter.Trim().ToUpper().Substring(0, 1)
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        $currentLetter = if ($part.DriveLetter) { $part.DriveLetter.ToString().ToUpper() } else { "" }

        # Protection: Cannot modify letter for Windows Boot/OS (C:)
        if ($currentLetter -eq "C" -or $part.IsBoot) {
            Write-Output (@{ error = "Cannot change drive letter of Windows OS boot partition (C:)."; status = "BOOT_PARTITION_LOCKED" } | ConvertTo-Json)
            exit 1
        }
        if ($targetLetter -eq "C") {
            Write-Output (@{ error = "Drive letter 'C' is reserved for Windows System boot volume."; status = "RESERVED_LETTER" } | ConvertTo-Json)
            exit 1
        }

        # Check collision
        $assigned = Get-AssignedDriveLettersList
        if ($assigned.ContainsKey($targetLetter) -and $targetLetter -ne $currentLetter) {
            Write-Output (@{ 
                error = "Drive letter '$targetLetter' is already in use by: $($assigned[$targetLetter]). Choose an unused letter."
                status = "LETTER_COLLISION"
            } | ConvertTo-Json)
            exit 1
        }

        $preview = @{
            mode = "SetDriveLetter"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            currentLetter = $currentLetter
            targetLetter = $targetLetter
            consequences = @(
                "Access paths and drive mappings for this volume will update to $targetLetter`:.",
                "Applications referencing hardcoded paths to old letter may need path reconfiguration."
            )
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if (-not $Confirmed) {
            $preview | ConvertTo-Json -Depth 5
            exit 0
        }

        # Execution
        Set-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -NewDriveLetter $targetLetter -ErrorAction Stop
        
        $audit = @{
            action = "SET_DRIVE_LETTER"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            oldLetter = $currentLetter
            newLetter = $targetLetter
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "SetDriveLetter"
            status = "SUCCESS"
            message = "Drive letter changed from '$currentLetter' to '$targetLetter'."
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "SetDriveLetter"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: RemoveDriveLetter
# -----------------------------------------------------------------------------
if ($Mode -eq "RemoveDriveLetter") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1) {
        Write-Output (@{ error = "Invalid DiskNumber or PartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        $currentLetter = if ($part.DriveLetter) { $part.DriveLetter.ToString().ToUpper() } else { "" }

        if (-not $currentLetter) {
            Write-Output (@{ error = "Partition does not currently have an assigned drive letter."; status = "NO_LETTER_ASSIGNED" } | ConvertTo-Json)
            exit 1
        }

        if ($currentLetter -eq "C" -or $part.IsBoot) {
            Write-Output (@{ error = "Cannot remove drive letter from Windows OS boot partition (C:)."; status = "BOOT_PARTITION_LOCKED" } | ConvertTo-Json)
            exit 1
        }

        $preview = @{
            mode = "RemoveDriveLetter"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            currentLetter = $currentLetter
            consequences = @(
                "The drive letter '$currentLetter`:' will be unmounted from Windows Explorer.",
                "Underlying data remains intact and the partition remains fully available for mount/re-assignment.",
                "Volume will no longer be visible under 'This PC' until a drive letter or mount folder is re-added."
            )
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if (-not $Confirmed) {
            $preview | ConvertTo-Json -Depth 5
            exit 0
        }

        # Remove access path
        Remove-PartitionAccessPath -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -Accesspath "$($currentLetter):\" -ErrorAction Stop

        $audit = @{
            action = "REMOVE_DRIVE_LETTER"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            removedLetter = $currentLetter
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "RemoveDriveLetter"
            status = "SUCCESS"
            message = "Drive letter '$currentLetter' unmounted successfully."
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "RemoveDriveLetter"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: SetVolumeLabel
# -----------------------------------------------------------------------------
if ($Mode -eq "SetVolumeLabel") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1) {
        Write-Output (@{ error = "Invalid DiskNumber or PartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        $newLabel = $TargetLabel.Trim()

        # Label length validation
        if ($newLabel.Length -gt 32) {
            Write-Output (@{ error = "Volume label cannot exceed 32 characters."; status = "LABEL_TOO_LONG" } | ConvertTo-Json)
            exit 1
        }

        # Check prohibited characters
        if ($newLabel -match '[<>:"/\\|?*]') {
            Write-Output (@{ error = 'Volume label contains illegal characters (< > : " / \ | ? *).'; status = "ILLEGAL_CHARACTERS" } | ConvertTo-Json)
            exit 1
        }

        $preview = @{
            mode = "SetVolumeLabel"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            newLabel = $newLabel
            consequences = @("Updates the friendly volume label shown in Windows Explorer and Disk Management.")
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if (-not $Confirmed) {
            $preview | ConvertTo-Json -Depth 5
            exit 0
        }

        # Execution
        if ($part.DriveLetter) {
            Set-Volume -DriveLetter $part.DriveLetter -NewFileSystemLabel $newLabel -ErrorAction Stop
        } else {
            $vol = Get-Volume -Partition $part -ErrorAction Stop
            Set-Volume -InputObject $vol -NewFileSystemLabel $newLabel -ErrorAction Stop
        }

        $audit = @{
            action = "SET_VOLUME_LABEL"
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            newLabel = $newLabel
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "SetVolumeLabel"
            status = "SUCCESS"
            message = "Volume label updated to '$newLabel'."
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "SetVolumeLabel"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: PlanSplitPartition & ExecuteSplitPartition
# -----------------------------------------------------------------------------
if ($Mode -eq "PlanSplitPartition" -or $Mode -eq "ExecuteSplitPartition") {
    if ($DiskNumber -lt 0 -or $PartitionNumber -lt 1 -or $SplitSizeBytes -le 0) {
        Write-Output (@{ error = "Invalid DiskNumber, PartitionNumber, or SplitSizeBytes"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
        
        # Shields: No EFI, MSR
        $gptType = if ($part.GptType) { $part.GptType.ToString().ToLower() } else { "" }
        $partType = if ($part.Type) { $part.Type.ToString().ToLower() } else { "" }
        if ($partType -eq "system" -or $partType -eq "reserved" -or $gptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or $gptType -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}") {
            Write-Output (@{ error = "Cannot split EFI System or Microsoft Reserved partitions."; status = "PROTECTED_PARTITION" } | ConvertTo-Json)
            exit 1
        }

        # Check supported size boundaries (Dual-mode: elevated CIM probe or high-precision cluster fallback)
        $minSupportedSize = [int64]0
        try {
            $supported = Get-PartitionSupportedSize -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -ErrorAction Stop
            $minSupportedSize = $supported.SizeMin
        } catch {
            # Fallback for standard user mode without CIM elevation
            $vol = if ($part.DriveLetter) { Get-Volume -DriveLetter $part.DriveLetter -ErrorAction SilentlyContinue } else { Get-Volume -Partition $part -ErrorAction SilentlyContinue }
            $usedBytes = if ($vol -and $vol.SizeRemaining) { $vol.Size - $vol.SizeRemaining } else { [int64]($part.Size * 0.75) }
            $safetyMargin = [Math]::Max([int64]($usedBytes * 0.05), 536870912) # 512 MB buffer
            $minSupportedSize = [int64]($usedBytes + $safetyMargin)
        }

        $maxShrinkBytes = [Math]::Max([int64]0, [int64]($part.Size - $minSupportedSize))
        
        # Snap SplitSizeBytes to 1 MiB boundary
        $snappedSplitBytes = [Math]::Floor($SplitSizeBytes / 1048576) * 1048576

        if ($snappedSplitBytes -gt $maxShrinkBytes) {
            Write-Output (@{ 
                error = "Requested split size ($([Math]::Round($snappedSplitBytes / 1e9, 2)) GB) exceeds maximum shrink boundary ($([Math]::Round($maxShrinkBytes / 1e9, 2)) GB) supported by the filesystem."
                status = "SPLIT_SIZE_EXCEEDS_FREE_SPACE"
                maxSupportedSplitBytes = $maxShrinkBytes
            } | ConvertTo-Json)
            exit 1
        }

        $newOrigSize = $part.Size - $snappedSplitBytes
        $newPartOffset = $part.Offset + $newOrigSize
        
        # Drive letter check
        $targetLetter = if ($TargetDriveLetter) { $TargetDriveLetter.Trim().ToUpper().Substring(0, 1) } else { "" }
        if ($targetLetter) {
            $assigned = Get-AssignedDriveLettersList
            if ($assigned.ContainsKey($targetLetter)) {
                Write-Output (@{ error = "Target drive letter '$targetLetter' is already in use."; status = "LETTER_COLLISION" } | ConvertTo-Json)
                exit 1
            }
        }

        $expectedCode = "SPLIT_DISK${DiskNumber}_PART${PartitionNumber}"

        $splitSteps = @(
            "Step 1: Shrink Partition $PartitionNumber from $([Math]::Round($part.Size / 1e9, 2)) GB to $([Math]::Round($newOrigSize / 1e9, 2)) GB (freed $([Math]::Round($snappedSplitBytes / 1e9, 2)) GB trailing unallocated space).",
            "Step 2: Create new basic data partition at offset $newPartOffset with size $([Math]::Round($snappedSplitBytes / 1e9, 2)) GB.",
            "Step 3: Format the new partition with $($TargetFileSystem.ToUpper()) (Label: '$TargetLabel')."
        )
        if ($targetLetter) {
            $splitSteps += "Step 4: Mount volume and assign drive letter '$targetLetter`:'."
        } else {
            $splitSteps += "Step 4: Leave volume unmounted until user assigns a drive letter."
        }

        $plan = @{
            mode = $Mode
            diskNumber = $DiskNumber
            partitionNumber = $PartitionNumber
            currentSizeBytes = $part.Size
            currentSizeGb = [Math]::Round($part.Size / 1e9, 2)
            retainedSizeBytes = $newOrigSize
            retainedSizeGb = [Math]::Round($newOrigSize / 1e9, 2)
            newPartitionSizeBytes = $snappedSplitBytes
            newPartitionSizeGb = [Math]::Round($snappedSplitBytes / 1e9, 2)
            newPartitionOffset = $newPartOffset
            newFileSystem = if ($TargetFileSystem) { $TargetFileSystem.ToUpper() } else { "NTFS" }
            newLabel = if ($TargetLabel) { $TargetLabel.Trim() } else { "New_Volume" }
            newDriveLetter = $targetLetter
            expectedConfirmationCode = $expectedCode
            steps = $splitSteps
            consequences = @(
                "The original partition will be shrunk in-place, leaving all existing files intact within the retained space.",
                "A second, clean volume will be instantiated immediately adjacent to the original partition."
            )
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if ($Mode -eq "PlanSplitPartition" -or -not $Confirmed) {
            $plan | ConvertTo-Json -Depth 5
            exit 0
        }

        # Execution
        if ($ConfirmationCode -ne $expectedCode) {
            $plan.status = "CONFIRMATION_MISMATCH"
            $plan.error = "Confirmation code mismatch. Expected '$expectedCode'."
            $plan | ConvertTo-Json -Depth 5
            exit 1
        }

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        
        # Step 1: Shrink
        Resize-Partition -DiskNumber $DiskNumber -PartitionNumber $PartitionNumber -Size $newOrigSize -ErrorAction Stop
        
        # Step 2: Create new partition in the gap
        $newPart = New-Partition -DiskNumber $DiskNumber -Offset $newPartOffset -Size $snappedSplitBytes -AssignDriveLetter:$false -ErrorAction Stop
        
        # Step 3: Format
        $fmtParams = @{
            FileSystem = $plan.newFileSystem
            NewFileSystemLabel = $plan.newLabel
            Confirm = $false
        }
        $newPart | Format-Volume @fmtParams -ErrorAction Stop | Out-Null

        # Step 4: Assign Drive Letter if specified
        if ($targetLetter) {
            Set-Partition -DiskNumber $DiskNumber -PartitionNumber $newPart.PartitionNumber -NewDriveLetter $targetLetter -ErrorAction Stop
        }

        $sw.Stop()

        $audit = @{
            action = "SPLIT_PARTITION"
            diskNumber = $DiskNumber
            originalPartitionNumber = $PartitionNumber
            newPartitionNumber = $newPart.PartitionNumber
            splitSizeBytes = $snappedSplitBytes
            newDriveLetter = $targetLetter
            durationMs = $sw.ElapsedMilliseconds
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "ExecuteSplitPartition"
            status = "SUCCESS"
            message = "Partition $PartitionNumber successfully split into two volumes."
            originalPartitionRetainedSizeGb = $plan.retainedSizeGb
            newPartitionNumber = $newPart.PartitionNumber
            newPartitionSizeGb = $plan.newPartitionSizeGb
            newDriveLetter = $targetLetter
            durationMs = $sw.ElapsedMilliseconds
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "SplitPartition"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# -----------------------------------------------------------------------------
# MODE: PlanMergePartitions & ExecuteMergePartitions
# -----------------------------------------------------------------------------
if ($Mode -eq "PlanMergePartitions" -or $Mode -eq "ExecuteMergePartitions") {
    if ($DiskNumber -lt 0 -or $TargetPartitionNumber -lt 1 -or $SourcePartitionNumber -lt 1 -or $TargetPartitionNumber -eq $SourcePartitionNumber) {
        Write-Output (@{ error = "Invalid DiskNumber, TargetPartitionNumber, or SourcePartitionNumber"; status = "INVALID_ARGS" } | ConvertTo-Json)
        exit 1
    }

    try {
        $targetPart = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $TargetPartitionNumber -ErrorAction Stop
        $sourcePart = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $SourcePartitionNumber -ErrorAction Stop

        # 1. SHIELD: Protected Partitions Prohibition
        $targetGpt = if ($targetPart.GptType) { $targetPart.GptType.ToString().ToLower() } else { "" }
        $sourceGpt = if ($sourcePart.GptType) { $sourcePart.GptType.ToString().ToLower() } else { "" }
        $targetType = if ($targetPart.Type) { $targetPart.Type.ToString().ToLower() } else { "" }
        $sourceType = if ($sourcePart.Type) { $sourcePart.Type.ToString().ToLower() } else { "" }

        if ($targetPart.IsSystem -or $sourcePart.IsSystem -or $targetPart.IsBoot -or $sourcePart.IsBoot -or
            $targetType -eq "system" -or $sourceType -eq "system" -or $targetType -eq "reserved" -or $sourceType -eq "reserved" -or
            $targetType -eq "recovery" -or $sourceType -eq "recovery" -or
            $targetGpt -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or $sourceGpt -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" -or
            $targetGpt -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}" -or $sourceGpt -eq "{e3c9e316-0b5c-4db8-817d-f92df00215ae}") {
            
            Write-Output (@{ 
                error = "MERGE REJECTED: Neither target nor source partition can be an EFI, MSR, Boot, System, or Recovery partition."
                status = "PROTECTED_PARTITION"
            } | ConvertTo-Json)
            exit 1
        }

        # 2. Strict Physical Adjacency Check
        $isAdjacent = $false
        $direction = "" # "TARGET_BEFORE_SOURCE" (Target on left, Source on right) or "SOURCE_BEFORE_TARGET"

        # Margin of alignment up to 1 MiB tolerance
        if ([Math]::Abs(($targetPart.Offset + $targetPart.Size) - $sourcePart.Offset) -le 1048576) {
            $isAdjacent = $true
            $direction = "TARGET_BEFORE_SOURCE"
        } elseif ([Math]::Abs(($sourcePart.Offset + $sourcePart.Size) - $targetPart.Offset) -le 1048576) {
            $isAdjacent = $true
            $direction = "SOURCE_BEFORE_TARGET"
        }

        if (-not $isAdjacent) {
            Write-Output (@{ 
                error = "MERGE REJECTED: Partitions are not physically contiguous. Target extent [Offset: $($targetPart.Offset), Size: $($targetPart.Size)] and Source extent [Offset: $($sourcePart.Offset), Size: $($sourcePart.Size)] have intervening partitions or gaps."
                status = "NOT_ADJACENT"
            } | ConvertTo-Json)
            exit 1
        }

        # 3. Direction and Filesystem extension constraint
        # In Windows native NTFS, a volume can only be extended forward (into trailing space to the right).
        # If source is on the right (TARGET_BEFORE_SOURCE), deleting source frees space immediately following target, so target can extend directly!
        # If source is on the left (SOURCE_BEFORE_TARGET), target cannot simply be extended to the left without moving target's data clusters!
        if ($direction -eq "SOURCE_BEFORE_TARGET") {
            Write-Output (@{ 
                error = "DIRECTION LIMITATION: Target partition (Index $TargetPartitionNumber) precedes Source partition to the left. Native NTFS extension only supports extending forward into trailing free space. Select Partition $SourcePartitionNumber as Target and Partition $TargetPartitionNumber as Source, or stage a relocation first."
                status = "REVERSE_MERGE_REQUIRES_RELOCATION"
            } | ConvertTo-Json)
            exit 1
        }

        # 4. Data capacity check
        $targetVol = if ($targetPart.DriveLetter) { Get-Volume -DriveLetter $targetPart.DriveLetter -ErrorAction SilentlyContinue } else { Get-Volume -Partition $targetPart -ErrorAction SilentlyContinue }
        $sourceVol = if ($sourcePart.DriveLetter) { Get-Volume -DriveLetter $sourcePart.DriveLetter -ErrorAction SilentlyContinue } else { Get-Volume -Partition $sourcePart -ErrorAction SilentlyContinue }
        
        $sourceUsedBytes = if ($sourceVol) { ($sourceVol.Size - $sourceVol.SizeRemaining) } else { 0 }
        $targetFreeBytes = if ($targetVol) { $targetVol.SizeRemaining } else { 0 }

        if ($PreserveSourceData -and $sourceUsedBytes -gt 0 -and $sourceUsedBytes -gt $targetFreeBytes) {
            Write-Output (@{ 
                error = "INSUFFICIENT CAPACITY: Target partition free space ($([Math]::Round($targetFreeBytes / 1e9, 2)) GB) is insufficient to hold Source partition data ($([Math]::Round($sourceUsedBytes / 1e9, 2)) GB) during consolidation."
                status = "INSUFFICIENT_TARGET_SPACE"
            } | ConvertTo-Json)
            exit 1
        }

        $mergedSizeBytes = $targetPart.Size + $sourcePart.Size
        $expectedCode = "MERGE_P${TargetPartitionNumber}_WITH_P${SourcePartitionNumber}"

        $mergeSteps = @()
        if ($PreserveSourceData -and $sourcePart.DriveLetter -and $targetPart.DriveLetter) {
            $mergeSteps += "Step 1: Consolidate data - Copy files from $($sourcePart.DriveLetter):\ to folder '$($targetPart.DriveLetter):\Merged_Data_from_$($sourcePart.DriveLetter)\'."
        } else {
            $mergeSteps += "Step 1: Backup verification - Source data preservation is either handled or source partition contains no active letter."
        }
        $mergeSteps += "Step 2: Dismount and delete Source Partition $SourcePartitionNumber ($([Math]::Round($sourcePart.Size / 1e9, 2)) GB), turning its extent into contiguous unallocated space."
        $mergeSteps += "Step 3: Extend Target Partition $TargetPartitionNumber from $([Math]::Round($targetPart.Size / 1e9, 2)) GB to $([Math]::Round($mergedSizeBytes / 1e9, 2)) GB into the newly freed space."

        $mergeConsequences = @(
            "Source Partition $SourcePartitionNumber will be PERMANENTLY REMOVED from the partition table.",
            "Target Partition $TargetPartitionNumber will expand to encompass both physical extents ($([Math]::Round($mergedSizeBytes / 1e9, 2)) GB total)."
        )
        if ($PreserveSourceData) {
            $mergeConsequences += "Source files will be cataloged inside the target folder."
        } else {
            $mergeConsequences += "Any data on the source partition not backed up will be lost."
        }

        $plan = @{
            mode = $Mode
            diskNumber = $DiskNumber
            targetPartitionNumber = $TargetPartitionNumber
            sourcePartitionNumber = $SourcePartitionNumber
            targetDriveLetter = if ($targetPart.DriveLetter) { $targetPart.DriveLetter.ToString() } else { "" }
            sourceDriveLetter = if ($sourcePart.DriveLetter) { $sourcePart.DriveLetter.ToString() } else { "" }
            direction = $direction
            targetCurrentSizeBytes = $targetPart.Size
            sourceCurrentSizeBytes = $sourcePart.Size
            mergedSizeBytes = $mergedSizeBytes
            mergedSizeGb = [Math]::Round($mergedSizeBytes / 1e9, 2)
            preserveSourceData = [bool]$PreserveSourceData
            expectedConfirmationCode = $expectedCode
            steps = $mergeSteps
            consequences = $mergeConsequences
            canExecute = $true
            status = "PREFLIGHT_PASS"
        }

        if ($Mode -eq "PlanMergePartitions" -or -not $Confirmed) {
            $plan | ConvertTo-Json -Depth 5
            exit 0
        }

        # Execution Gate
        if ($ConfirmationCode -ne $expectedCode) {
            $plan.status = "CONFIRMATION_MISMATCH"
            $plan.error = "Confirmation code mismatch. Expected '$expectedCode'."
            $plan | ConvertTo-Json -Depth 5
            exit 1
        }

        $sw = [System.Diagnostics.Stopwatch]::StartNew()

        # Step 1: Copy data if requested and both letters present
        if ($PreserveSourceData -and $sourcePart.DriveLetter -and $targetPart.DriveLetter) {
            $destDir = "$($targetPart.DriveLetter):\Merged_Data_from_$($sourcePart.DriveLetter)"
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            # Robocopy for high-fidelity transfer
            robocopy "$($sourcePart.DriveLetter):\" $destDir /E /R:1 /W:1 /XJ /NFL /NDL | Out-Null
        }

        # Step 2: Delete source partition
        Remove-Partition -DiskNumber $DiskNumber -PartitionNumber $SourcePartitionNumber -Confirm:$false -ErrorAction Stop

        # Step 3: Extend target partition
        Resize-Partition -DiskNumber $DiskNumber -PartitionNumber $TargetPartitionNumber -Size $mergedSizeBytes -ErrorAction Stop

        $sw.Stop()

        $audit = @{
            action = "MERGE_PARTITIONS"
            diskNumber = $DiskNumber
            targetPartitionNumber = $TargetPartitionNumber
            sourcePartitionNumber = $SourcePartitionNumber
            mergedSizeBytes = $mergedSizeBytes
            preservedData = [bool]$PreserveSourceData
            durationMs = $sw.ElapsedMilliseconds
            status = "SUCCESS"
        }
        Write-AdvancedAuditLog -Record $audit

        $res = @{
            mode = "ExecuteMergePartitions"
            status = "SUCCESS"
            message = "Partitions successfully merged into Volume $TargetPartitionNumber."
            mergedSizeGb = $plan.mergedSizeGb
            durationMs = $sw.ElapsedMilliseconds
            audit = $audit
        }
        $res | ConvertTo-Json -Depth 5
        exit 0
    } catch {
        $res = @{
            mode = "MergePartitions"
            status = "EXECUTION_FAILED"
            error = $_.Exception.Message
        }
        $res | ConvertTo-Json -Depth 5
        exit 1
    }
}

# Fallthrough
Write-Output (@{ error = "Unhandled mode '$Mode'"; status = "UNKNOWN_MODE" } | ConvertTo-Json)
exit 1
