/**
 * OpenDisk Manager - Synthetic Virtual Disk Test Harness
 * Platform: Windows 11 x64 Storage Systems Simulation
 * 
 * Provides an isolated, file-backed/memory-backed virtual disk emulator
 * for non-destructive testing of partition shrink, extend, movement,
 * and recovery workflows without ever touching host physical storage.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SECTOR_SIZE = 512;
export const ALIGNMENT_SECTORS = 2048; // 1 MiB grid (2048 * 512 = 1,048,576 bytes)

// Standard GPT GUIDs
export const GPT_GUIDS = {
  EFI: "c12a7328-f81f-11d2-ba4b-00a0c93ec93b",
  MSR: "e3c9e316-0b5c-4db8-817d-f92df00215ae",
  BASIC_DATA: "ebd0a0a2-b9e5-4433-87c0-68b6b72699c7",
  RECOVERY: "de94bba4-06d1-4d40-a16a-bfd50179d6ac"
};

export class SyntheticVirtualDisk {
  /**
   * @param {number} totalSizeMb - Size of virtual disk in megabytes (e.g., 64 MB = 131,072 sectors)
   */
  constructor(totalSizeMb = 64) {
    this.totalSizeMb = totalSizeMb;
    this.totalSizeBytes = totalSizeMb * 1024 * 1024;
    this.totalSectors = Math.floor(this.totalSizeBytes / SECTOR_SIZE);
    this.diskBuffer = Buffer.alloc(this.totalSizeBytes, 0);
    this.partitions = [];
    this.fileRegistry = new Map(); // path -> { partNum, relativeOffset, size, sha256, data }
    this.isDirty = false;
    this.initializeGptLayout();
  }

  /**
   * Initializes standard Windows 11 GPT disk layout
   */
  initializeGptLayout() {
    // 1. Protective MBR at LBA 0
    this.diskBuffer.write("OPENDISK_PMBR", 0, "ascii");
    this.diskBuffer.writeUInt8(0x55, 510);
    this.diskBuffer.writeUInt8(0xAA, 511);

    // 2. Primary GPT Header at LBA 1
    const gptHeaderOffset = 1 * SECTOR_SIZE;
    this.diskBuffer.write("EFI PART", gptHeaderOffset, "ascii"); // Signature
    this.diskBuffer.writeUInt32LE(0x00010000, gptHeaderOffset + 8); // Revision 1.0
    this.diskBuffer.writeUInt32LE(92, gptHeaderOffset + 12); // Header size
    this.diskBuffer.writeBigUInt64LE(1n, gptHeaderOffset + 24); // MyLBA
    this.diskBuffer.writeBigUInt64LE(BigInt(this.totalSectors - 1), gptHeaderOffset + 32); // AlternateLBA
    this.diskBuffer.writeBigUInt64LE(34n, gptHeaderOffset + 40); // FirstUsableLBA
    this.diskBuffer.writeBigUInt64LE(BigInt(this.totalSectors - 34), gptHeaderOffset + 48); // LastUsableLBA

    // Partition Table starts at LBA 2 (32 sectors = 128 entries * 128 bytes)
    this.partitions = [];

    // Part 1: EFI System Partition (ESP) - 4 MiB (8,192 sectors)
    this.addPartition({
      partitionNumber: 1,
      name: "EFI System Partition",
      category: "EFI",
      typeGuid: GPT_GUIDS.EFI,
      startLba: 2048,
      sectorCount: 8192,
      fsType: "FAT32",
      isSystem: true
    });

    // Part 2: Microsoft Reserved (MSR) - 2 MiB (4,096 sectors)
    this.addPartition({
      partitionNumber: 2,
      name: "Microsoft Reserved",
      category: "MSR",
      typeGuid: GPT_GUIDS.MSR,
      startLba: 10240,
      sectorCount: 4096,
      fsType: "RAW",
      isSystem: false
    });

    // Part 3: Windows Boot OS (C:) - 16 MiB (32,768 sectors)
    this.addPartition({
      partitionNumber: 3,
      name: "OS (C:)",
      category: "SYSTEM",
      volumeLetter: "C:",
      typeGuid: GPT_GUIDS.BASIC_DATA,
      startLba: 14336,
      sectorCount: 32768,
      fsType: "NTFS",
      isSystem: true,
      isBoot: true
    });

    // Part 4: Windows Recovery (WinRE) - 4 MiB (8,192 sectors)
    this.addPartition({
      partitionNumber: 4,
      name: "Recovery",
      category: "RECOVERY",
      typeGuid: GPT_GUIDS.RECOVERY,
      startLba: 47104,
      sectorCount: 8192,
      fsType: "NTFS",
      isSystem: false
    });

    // Part 5: Data Partition (D:) - 16 MiB (32,768 sectors)
    this.addPartition({
      partitionNumber: 5,
      name: "Projects (D:)",
      category: "DATA",
      volumeLetter: "D:",
      typeGuid: GPT_GUIDS.BASIC_DATA,
      startLba: 55296,
      sectorCount: 32768,
      fsType: "NTFS",
      isSystem: false
    });

    // Gap: 10 MiB unallocated (from LBA 88064 to 108544 = 20,480 sectors)
    // Part 6: Data Partition (E:) - 10 MiB (20,480 sectors)
    this.addPartition({
      partitionNumber: 6,
      name: "Storage (E:)",
      category: "DATA",
      volumeLetter: "E:",
      typeGuid: GPT_GUIDS.BASIC_DATA,
      startLba: 108544,
      sectorCount: 20480,
      fsType: "NTFS",
      isSystem: false
    });

    this.writeGptPartitionTable();
    this.populateTestFiles(5); // Populate test files into Partition 5 (D:)
  }

  addPartition(part) {
    const endLba = part.startLba + part.sectorCount - 1;
    const partitionRecord = {
      ...part,
      endLba,
      sizeBytes: part.sectorCount * SECTOR_SIZE,
      usedBytes: Math.floor(part.sectorCount * SECTOR_SIZE * 0.4) // default 40% used
    };
    this.partitions.push(partitionRecord);
  }

  writeGptPartitionTable() {
    // Write entries to LBA 2..33
    const entryStartOffset = 2 * SECTOR_SIZE;
    this.partitions.forEach((part, idx) => {
      const offset = entryStartOffset + (idx * 128);
      // Write Type GUID (ascii string representation)
      this.diskBuffer.write(part.typeGuid, offset, "utf8");
      // Unique GUID
      this.diskBuffer.write(crypto.randomUUID(), offset + 16, "utf8");
      // Starting LBA
      this.diskBuffer.writeBigUInt64LE(BigInt(part.startLba), offset + 32);
      // Ending LBA
      this.diskBuffer.writeBigUInt64LE(BigInt(part.endLba), offset + 40);
      // Partition Name (UTF-16LE, 72 bytes)
      this.diskBuffer.write(part.name, offset + 56, "utf16le");
    });
  }

  /**
   * Injects mock test files into a partition extent and records their SHA-256 hashes
   */
  populateTestFiles(partNum) {
    const part = this.partitions.find(p => p.partitionNumber === partNum);
    if (!part) return;

    const testFiles = [
      { name: "system_config.json", size: 4096, pattern: "JSON_PAYLOAD_CONFIG_HEADER_SAFE" },
      { name: "user_database.sqlite", size: 65536, pattern: "SQLITE_HEADER_TABLE_SCHEMA_V1" },
      { name: "critical_document.docx", size: 32768, pattern: "DOCX_ARCHIVE_XML_ENCRYPTED_CHUNK" },
      { name: "financial_ledger.csv", size: 16384, pattern: "CSV_RECORD_ID_TRANSACTION_AUDIT" },
      { name: "project_archive.tar", size: 131072, pattern: "TAR_ARCHIVE_DATA_BLOCKS_CORPUS" }
    ];

    let currentRelOffset = 4096; // 8 sectors past VBR
    for (const tf of testFiles) {
      const fileData = Buffer.alloc(tf.size);
      for (let i = 0; i < tf.size; i += tf.pattern.length) {
        fileData.write(tf.pattern, i, "utf8");
      }

      const sha256 = crypto.createHash("sha256").update(fileData).digest("hex");
      const diskOffset = (part.startLba * SECTOR_SIZE) + currentRelOffset;

      fileData.copy(this.diskBuffer, diskOffset);

      this.fileRegistry.set(`${partNum}:${tf.name}`, {
        name: tf.name,
        partNum,
        relativeOffset: currentRelOffset,
        size: tf.size,
        expectedSha256: sha256,
        originalDiskOffset: diskOffset
      });

      currentRelOffset += tf.size + 2048; // Space out files
    }
  }

  /**
   * Verifies data integrity of all registered test files on the partition
   */
  verifyFileIntegrity(partNum) {
    const part = this.partitions.find(p => p.partitionNumber === partNum);
    if (!part) throw new Error(`Partition ${partNum} not found.`);

    const results = [];
    for (const [key, meta] of this.fileRegistry.entries()) {
      if (meta.partNum === partNum) {
        const diskOffset = (part.startLba * SECTOR_SIZE) + meta.relativeOffset;
        const actualData = this.diskBuffer.subarray(diskOffset, diskOffset + meta.size);
        const actualSha256 = crypto.createHash("sha256").update(actualData).digest("hex");

        const matches = actualSha256 === meta.expectedSha256;
        results.push({
          name: meta.name,
          matches,
          expectedSha256: meta.expectedSha256,
          actualSha256,
          diskOffset
        });
      }
    }
    return results;
  }

  /**
   * Simulates partition resize (shrink/extend) on the virtual disk
   */
  executeResize(partNum, targetSizeBytes) {
    const part = this.partitions.find(p => p.partitionNumber === partNum);
    if (!part) throw new Error(`Partition ${partNum} not found.`);

    const targetSectors = Math.floor(targetSizeBytes / SECTOR_SIZE);
    const newEndLba = part.startLba + targetSectors - 1;

    // Check bounds
    if (targetSizeBytes < part.usedBytes) {
      throw new Error("RESIZE_ERROR: Target size below minimum data boundary.");
    }

    part.sectorCount = targetSectors;
    part.endLba = newEndLba;
    part.sizeBytes = targetSizeBytes;

    this.writeGptPartitionTable();
    return { success: true, partNum, newSizeBytes: targetSizeBytes, newEndLba };
  }

  /**
   * Simulates partition movement with directional extent overlap handling and optional crash injection
   */
  executeMovement(partNum, deltaSectors, options = {}) {
    const { faultAtPercent = -1, copyDirection = "AUTO" } = options;
    const part = this.partitions.find(p => p.partitionNumber === partNum);
    if (!part) throw new Error(`Partition ${partNum} not found.`);

    const oldStartLba = part.startLba;
    const targetStartLba = oldStartLba + deltaSectors;
    const sectorCount = part.sectorCount;

    // Snap target start to 1 MiB alignment
    const alignedStartLba = Math.floor(targetStartLba / ALIGNMENT_SECTORS) * ALIGNMENT_SECTORS;
    const actualDelta = alignedStartLba - oldStartLba;

    const isShiftRight = actualDelta > 0;
    const strategy = isShiftRight ? "TAIL_TO_HEAD" : "HEAD_TO_TAIL";

    const oldOffset = oldStartLba * SECTOR_SIZE;
    const newOffset = alignedStartLba * SECTOR_SIZE;
    const totalBytes = sectorCount * SECTOR_SIZE;

    // Simulate sector-by-sector copy with crash injection
    const bufferCopy = Buffer.alloc(totalBytes);
    this.diskBuffer.copy(bufferCopy, 0, oldOffset, oldOffset + totalBytes);

    if (faultAtPercent >= 0 && faultAtPercent < 100) {
      // Simulate crash midway through copy
      const bytesWrittenBeforeCrash = Math.floor(totalBytes * (faultAtPercent / 100));
      bufferCopy.copy(this.diskBuffer, newOffset, 0, bytesWrittenBeforeCrash);
      this.isDirty = true;
      throw new Error(`CRASH_INJECTION: Host process terminated unexpectedly at ${faultAtPercent}% of block relocation.`);
    }

    // Full successful copy
    bufferCopy.copy(this.diskBuffer, newOffset, 0, totalBytes);

    // Update partition record and GPT
    part.startLba = alignedStartLba;
    part.endLba = alignedStartLba + sectorCount - 1;
    this.writeGptPartitionTable();

    return {
      success: true,
      partNum,
      oldStartLba,
      newStartLba: alignedStartLba,
      strategy,
      isShiftRight
    };
  }

  /**
   * Verifies GPT structural consistency (bounds, 1 MiB alignment, no overlaps)
   */
  verifyGptConsistency() {
    const issues = [];
    let prevEnd = -1;

    for (const part of this.partitions) {
      // Alignment
      if (part.startLba % ALIGNMENT_SECTORS !== 0) {
        issues.push(`Partition #${part.partitionNumber} LBA ${part.startLba} is not 1 MiB aligned.`);
      }

      // Overlap
      if (part.startLba <= prevEnd) {
        issues.push(`Partition #${part.partitionNumber} start LBA ${part.startLba} overlaps preceding extent end LBA ${prevEnd}.`);
      }

      // Valid sector range
      if (part.endLba <= part.startLba) {
        issues.push(`Partition #${part.partitionNumber} invalid LBA range (${part.startLba} to ${part.endLba}).`);
      }

      // Disk boundary
      if (part.endLba >= this.totalSectors) {
        issues.push(`Partition #${part.partitionNumber} exceeds total disk sectors (${part.endLba} >= ${this.totalSectors}).`);
      }

      prevEnd = part.endLba;
    }

    return {
      isValid: issues.length === 0,
      issuesCount: issues.length,
      issues
    };
  }
}

