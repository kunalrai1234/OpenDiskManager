/**
 * OpenDisk Manager — High-Fidelity Mock Storage Topology
 * Accurately models real Windows 11 NVMe, SATA, and USB partition layouts.
 */

export const MOCK_DISKS = [
  {
    id: 0,
    path: "\\\\.\\PhysicalDrive0",
    model: "Samsung SSD 980 PRO 1TB",
    serialNumber: "S5GXNF0R123456",
    busType: "NVMe (PCIe 4.0 x4)",
    partitionStyle: "GPT",
    totalSizeBytes: 1000204886016, // ~1000.2 GB (931.5 GiB)
    sectorSize: 512,
    physicalSectorSize: 4096,
    isSystemDisk: true,
    isReadOnly: false,
    temperatureCelsius: 38,
    healthPercent: 99,
    smartStatus: "Healthy (0 Reallocated Sectors)",
    powerOnHours: 1420,
    partitions: [
      {
        id: "p0-1",
        diskId: 0,
        partitionNumber: 1,
        volumeLetter: null,
        label: "SYSTEM",
        category: "EFI",
        fsType: "FAT32",
        startLba: 2048,
        endLba: 206847,
        sizeBytes: 104857600, // 100 MB
        usedBytes: 35651584,  // ~34 MB
        typeGuid: "c12a7328-f81f-11d2-ba4b-00a0c93ec93b",
        uniqueGuid: "7B2144A2-9E33-4D89-A92B-019948BC51D1",
        isBoot: true,
        isSystem: true,
        isBitLocker: false,
        isProtected: true,
        clusterSize: 4096,
        status: "Healthy (Active Boot)",
      },
      {
        id: "p0-2",
        diskId: 0,
        partitionNumber: 2,
        volumeLetter: null,
        label: "MSR",
        category: "MSR",
        fsType: "RAW",
        startLba: 206848,
        endLba: 239615,
        sizeBytes: 16777216, // 16 MB
        usedBytes: 16777216,
        typeGuid: "e3c9e310-0b4f-4b4e-b8d3-7727ac411c58",
        uniqueGuid: "F491E211-1402-4A88-82E9-C52B9114D33F",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: true,
        clusterSize: 0,
        status: "Reserved",
      },
      {
        id: "p0-3",
        diskId: 0,
        partitionNumber: 3,
        volumeLetter: "C:",
        label: "Windows 11",
        category: "SYSTEM",
        fsType: "NTFS",
        startLba: 239616,
        endLba: 944062463,
        sizeBytes: 483237302272, // ~450.0 GB
        usedBytes: 230485237760, // ~214.6 GB (47.7%)
        typeGuid: "ebd0a0a2-b9e5-4433-87c0-68b6b72699c7",
        uniqueGuid: "A281483B-4921-460B-975F-6A0BC818DF34",
        isBoot: true,
        isSystem: true,
        isBitLocker: true,
        bitLockerStatus: "Unlocked (TPM 2.0 PCR 7/11 Active)",
        isProtected: false,
        clusterSize: 4096,
        status: "Healthy (OS / Boot / Pagefile)",
      },
      {
        id: "p0-4",
        diskId: 0,
        partitionNumber: 4,
        volumeLetter: "D:",
        label: "Projects & Dev",
        category: "DATA",
        fsType: "NTFS",
        startLba: 944062464,
        endLba: 1740943359,
        sizeBytes: 408003018752, // ~380.0 GB
        usedBytes: 212450897920, // ~197.8 GB (52.1%)
        typeGuid: "ebd0a0a2-b9e5-4433-87c0-68b6b72699c7",
        uniqueGuid: "C1998342-9988-4611-9F31-893041920AFE",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 4096,
        status: "Healthy (Basic Data)",
      },
      {
        id: "p0-5",
        diskId: 0,
        partitionNumber: 5,
        volumeLetter: null,
        label: "Recovery",
        category: "RECOVERY",
        fsType: "NTFS",
        startLba: 1740943360,
        endLba: 1742479359,
        sizeBytes: 786432000, // 750 MB
        usedBytes: 545259520, // 520 MB
        typeGuid: "de194273-0d2f-483d-883a-b64f37e4f714",
        uniqueGuid: "5E410319-BB89-421A-A60B-F00139182390",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: true,
        clusterSize: 4096,
        status: "Healthy (WinRE Active)",
      },
      {
        id: "p0-unalloc",
        diskId: 0,
        partitionNumber: -1,
        volumeLetter: null,
        label: "Unallocated Space",
        category: "UNALLOCATED",
        fsType: "None",
        startLba: 1742479360,
        endLba: 1953525167,
        sizeBytes: 108055453696, // ~100.6 GB
        usedBytes: 0,
        typeGuid: null,
        uniqueGuid: null,
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 0,
        status: "Unallocated Free Space",
      }
    ]
  },
  {
    id: 1,
    path: "\\\\.\\PhysicalDrive1",
    model: "Crucial MX500 2TB SSD",
    serialNumber: "2104E4D099AA",
    busType: "SATA III (6.0 Gb/s)",
    partitionStyle: "GPT",
    totalSizeBytes: 2000398934016, // ~2000.4 GB (1863.0 GiB)
    sectorSize: 512,
    physicalSectorSize: 4096,
    isSystemDisk: false,
    isReadOnly: false,
    temperatureCelsius: 32,
    healthPercent: 96,
    smartStatus: "Healthy (0 Errors)",
    powerOnHours: 4980,
    partitions: [
      {
        id: "p1-1",
        diskId: 1,
        partitionNumber: 1,
        volumeLetter: "E:",
        label: "Games & Media",
        category: "DATA",
        fsType: "NTFS",
        startLba: 2048,
        endLba: 2516584447,
        sizeBytes: 1288490188800, // 1200.0 GB
        usedBytes: 955364802560,  // ~889.7 GB (74.1%)
        typeGuid: "ebd0a0a2-b9e5-4433-87c0-68b6b72699c7",
        uniqueGuid: "6348AA01-4412-4BD1-BC02-4410E7C091A4",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 4096,
        status: "Healthy",
      },
      {
        id: "p1-unalloc",
        diskId: 1,
        partitionNumber: -1,
        volumeLetter: null,
        label: "Unallocated Space",
        category: "UNALLOCATED",
        fsType: "None",
        startLba: 2516584448,
        endLba: 3145730047,
        sizeBytes: 322122547200, // 300.0 GB
        usedBytes: 0,
        typeGuid: null,
        uniqueGuid: null,
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 0,
        status: "Unallocated Free Space",
      },
      {
        id: "p1-2",
        diskId: 1,
        partitionNumber: 2,
        volumeLetter: "F:",
        label: "VM Labs & VHDX",
        category: "DATA",
        fsType: "exFAT",
        startLba: 3145730048,
        endLba: 3907029167,
        sizeBytes: 389785149440, // ~363.0 GB
        usedBytes: 161061273600, // ~150.0 GB (41.3%)
        typeGuid: "ebd0a0a2-b9e5-4433-87c0-68b6b72699c7",
        uniqueGuid: "99182BA3-0012-44AF-AC11-DF990145E412",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 131072, // 128 KB cluster
        status: "Healthy",
      }
    ]
  },
  {
    id: 2,
    path: "\\\\.\\PhysicalDrive2",
    model: "SanDisk Ultra USB 3.0",
    serialNumber: "4C530001230918113",
    busType: "USB (Removable Media)",
    partitionStyle: "MBR",
    totalSizeBytes: 62000000000, // ~62.0 GB (57.7 GiB)
    sectorSize: 512,
    physicalSectorSize: 512,
    isSystemDisk: false,
    isReadOnly: false,
    temperatureCelsius: 28,
    healthPercent: 100,
    smartStatus: "Removable USB Drive",
    powerOnHours: 110,
    partitions: [
      {
        id: "p2-1",
        diskId: 2,
        partitionNumber: 1,
        volumeLetter: "G:",
        label: "VENTOY",
        category: "DATA",
        fsType: "FAT32",
        startLba: 2048,
        endLba: 67110911,
        sizeBytes: 34359738368, // 32.0 GB
        usedBytes: 19756843008, // ~18.4 GB (57.5%)
        typeGuid: "0x0B (FAT32 LBA)",
        uniqueGuid: "MBR-SIG-0x49A1F29B-1",
        isBoot: true,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 16384,
        status: "Active Bootable MBR",
      },
      {
        id: "p2-2",
        diskId: 2,
        partitionNumber: 2,
        volumeLetter: "H:",
        label: "PORTABLE_DATA",
        category: "DATA",
        fsType: "NTFS",
        startLba: 67110912,
        endLba: 113248255,
        sizeBytes: 23622319616, // ~22.0 GB
        usedBytes: 11811159808, // ~11.0 GB (50%)
        typeGuid: "0x07 (NTFS)",
        uniqueGuid: "MBR-SIG-0x49A1F29B-2",
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 4096,
        status: "Healthy",
      },
      {
        id: "p2-unalloc",
        diskId: 2,
        partitionNumber: -1,
        volumeLetter: null,
        label: "Unallocated Space",
        category: "UNALLOCATED",
        fsType: "None",
        startLba: 113248256,
        endLba: 121093749,
        sizeBytes: 4016892928, // ~3.74 GB
        usedBytes: 0,
        typeGuid: null,
        uniqueGuid: null,
        isBoot: false,
        isSystem: false,
        isBitLocker: false,
        isProtected: false,
        clusterSize: 0,
        status: "Unallocated",
      }
    ]
  }
];

export const INITIAL_QUEUED_OPS = [
  {
    id: "op-1",
    action: "SHRINK_VOLUME",
    title: "Shrink Volume D: (Projects & Dev)",
    diskId: 0,
    partitionId: "p0-4",
    targetLbaRange: "LBA 944,062,464 -> 1,531,230,207",
    currentSizeGb: 380.0,
    targetSizeGb: 280.0,
    deltaGb: -100.0,
    severity: "SAFE",
    status: "PENDING",
    details: "Filesystem resize via FSCTL_SHRINK_VOLUME. Generates 100.0 GB of unallocated space."
  },
  {
    id: "op-2",
    action: "MOVE_PARTITION",
    title: "Move Partition WinRE to End of Disk",
    diskId: 0,
    partitionId: "p0-5",
    targetLbaRange: "LBA 1,740,943,360 -> 1,952,000,000",
    currentSizeGb: 0.75,
    targetSizeGb: 0.75,
    deltaGb: 0,
    severity: "MODERATE",
    status: "PENDING",
    details: "Relocates 750 MB recovery partition to physical disk end. Coordinated with reagentc."
  }
];

export const INITIAL_HISTORY = [
  {
    id: "hist-101",
    timestamp: "2026-11-06 18:24:12",
    action: "INSPECT_TOPOLOGY",
    disk: "PhysicalDrive0 (Samsung 980 PRO)",
    details: "Scanned GPT structure, 5 partitions, verified 1 MiB boundary alignment.",
    status: "SUCCESS"
  },
  {
    id: "hist-102",
    timestamp: "2026-11-06 18:24:15",
    action: "CHECK_BITLOCKER",
    disk: "Volume C: (Windows 11)",
    details: "BitLocker protection detected: Unlocked, TPM PCR 7/11 verified sealed.",
    status: "SUCCESS"
  },
  {
    id: "hist-103",
    timestamp: "2026-11-07 09:12:04",
    action: "SIMULATE_EXTEND",
    disk: "PhysicalDrive1 (Crucial MX500)",
    details: "Simulation: Extended Volume E: into adjacent 300 GB unallocated space.",
    status: "SIMULATED"
  }
];

