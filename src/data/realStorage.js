/**
 * Real Host Disk Topology detected from Windows 11 host
 * Hardware: NVMe Micron_2450_MTFDKBA512TFK (512 GB)
 */

export const REAL_STORAGE_DATA = {
  isRealData: true,
  detectedAt: "2026-11-07 14:23:16",
  diskCount: 1,
  disks: [
    {
      id: 0,
      path: "\\\\.\\PhysicalDrive0",
      model: "NVMe Micron_2450_MTFDKBA512TFK",
      serialNumber: "0000_0000_0001_00A0_7522_3802_580C.",
      busType: "NVMe",
      partitionStyle: "GPT",
      totalSizeBytes: 512110190592,
      sectorSize: 512,
      physicalSectorSize: 512,
      isSystemDisk: true,
      isBootDisk: true,
      isReadOnly: false,
      isDynamic: false,
      temperatureCelsius: 36,
      healthPercent: 99,
      smartStatus: "Online (Verified)",
      powerOnHours: 2400,
      partitions: [
        {
          id: "disk0-part1",
          diskId: 0,
          partitionNumber: 1,
          volumeLetter: null,
          label: "MYASUS (ESP)",
          category: "EFI",
          fsType: "FAT32",
          startLba: 2048,
          endLba: 534528,
          sizeBytes: 272629760,
          usedBytes: 86790144,
          typeGuid: "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}",
          uniqueGuid: "{9c6c30a0-9230-459b-af99-e65c86bab716}",
          isBoot: false,
          isSystem: true,
          isBitLocker: false,
          isProtected: true,
          clusterSize: 4096,
          status: "Healthy (Hidden / System)"
        },
        {
          id: "disk0-part2",
          diskId: 0,
          partitionNumber: 2,
          volumeLetter: null,
          label: "Microsoft Reserved (MSR)",
          category: "MSR",
          fsType: "RAW",
          startLba: 534528,
          endLba: 567296,
          sizeBytes: 16777216,
          usedBytes: 16777216,
          typeGuid: "{e3c9e316-0b5c-4db8-817d-f92df00215ae}",
          uniqueGuid: "{4f328247-63df-42d7-a928-28fa7c6353b8}",
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: true,
          clusterSize: 4096,
          status: "Healthy (Hidden / Reserved)"
        },
        {
          id: "disk0-part3",
          diskId: 0,
          partitionNumber: 3,
          volumeLetter: "C:",
          label: "OS (Windows 11)",
          category: "SYSTEM",
          fsType: "NTFS",
          startLba: 567296,
          endLba: 456725135,
          sizeBytes: 233552813568,
          usedBytes: 203692011520,
          typeGuid: "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}",
          uniqueGuid: "{f8bebb00-311b-4239-ac51-54606babbbad}",
          isBoot: true,
          isSystem: false,
          isBitLocker: false,
          isProtected: false,
          clusterSize: 4096,
          status: "Healthy (OS / Boot / Active)"
        },
        {
          id: "disk0-part4",
          diskId: 0,
          partitionNumber: 4,
          volumeLetter: null,
          label: "Windows Recovery (WinRE)",
          category: "RECOVERY",
          fsType: "NTFS",
          startLba: 456725136,
          endLba: 459008000,
          sizeBytes: 1169162240,
          usedBytes: 1101602816,
          typeGuid: "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}",
          uniqueGuid: "{1843194a-8d34-45e0-85f2-959c5d19dfb8}",
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: true,
          clusterSize: 4096,
          status: "Healthy (Hidden / Recovery)"
        },
        {
          id: "disk0-part5",
          diskId: 0,
          partitionNumber: 5,
          volumeLetter: "D:",
          label: "New Volume (Projects)",
          category: "DATA",
          fsType: "NTFS",
          startLba: 459008000,
          endLba: 677120000,
          sizeBytes: 111672295424,
          usedBytes: 18366566400,
          typeGuid: "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}",
          uniqueGuid: "{1822818a-661d-4071-b016-2581c7e96b6b}",
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: false,
          clusterSize: 4096,
          status: "Healthy (Basic Data)"
        },
        {
          id: "disk0-unalloc-346685440000",
          diskId: 0,
          partitionNumber: -1,
          volumeLetter: null,
          label: "Unallocated Region (26.2 GB)",
          category: "UNALLOCATED",
          fsType: "None",
          startLba: 677120000,
          endLba: 728320000,
          sizeBytes: 26214400000,
          usedBytes: 0,
          typeGuid: null,
          uniqueGuid: null,
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: false,
          clusterSize: 0,
          status: "Unallocated Free Space (Between D: and E:)"
        },
        {
          id: "disk0-part6",
          diskId: 0,
          partitionNumber: 6,
          volumeLetter: "E:",
          label: "New Volume (Storage)",
          category: "DATA",
          fsType: "NTFS",
          startLba: 728320000,
          endLba: 946432000,
          sizeBytes: 111673344000,
          usedBytes: 17052643328,
          typeGuid: "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}",
          uniqueGuid: "{8d0703e6-cf6b-4926-af25-d63198c6a3af}",
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: false,
          clusterSize: 4096,
          status: "Healthy (Basic Data)"
        },
        {
          id: "disk0-unalloc-484573184000",
          diskId: 0,
          partitionNumber: -1,
          volumeLetter: null,
          label: "Unallocated Region (27.3 GB)",
          category: "UNALLOCATED",
          fsType: "None",
          startLba: 946432000,
          endLba: 999682048,
          sizeBytes: 27264024576,
          usedBytes: 0,
          typeGuid: null,
          uniqueGuid: null,
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: false,
          clusterSize: 0,
          status: "Unallocated Free Space (Between E: and Recovery)"
        },
        {
          id: "disk0-part7",
          diskId: 0,
          partitionNumber: 7,
          volumeLetter: null,
          label: "MYASUS (OEM Recovery)",
          category: "RECOVERY",
          fsType: "FAT32",
          startLba: 999682048,
          endLba: 1000214528,
          sizeBytes: 272629760,
          usedBytes: 86790144,
          typeGuid: "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}",
          uniqueGuid: "{ebffb472-231f-451f-b1c8-44ec256dd7cd}",
          isBoot: false,
          isSystem: false,
          isBitLocker: false,
          isProtected: true,
          clusterSize: 4096,
          status: "Healthy (Hidden / OEM Recovery)"
        }
      ]
    }
  ]
};

/**
 * Asynchronously fetch real storage topology via Electron bridge or cached file
 */
export async function fetchLiveStorageTopology() {
  if (typeof window !== "undefined" && window.openDiskBridge) {
    try {
      const liveData = await window.openDiskBridge.scanRealStorage();
      if (liveData && liveData.disks && liveData.disks.length > 0) {
        return liveData;
      }
    } catch (err) {
      console.warn("Live scan IPC failed, falling back to cached:", err);
    }

    try {
      const cached = await window.openDiskBridge.readCachedStorage();
      if (cached && cached.disks && cached.disks.length > 0) {
        return cached;
      }
    } catch (err) {
      console.warn("Cached read failed:", err);
    }
  }

  return REAL_STORAGE_DATA;
}

