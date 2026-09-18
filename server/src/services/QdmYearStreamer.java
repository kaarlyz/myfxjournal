
package com.strategyquant.datalib.data.io.newDataFormat;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class QdmYearStreamer {
    public static void main(String[] args) {
        if (args.length < 1) System.exit(1);
        File zipFile = new File(args[0]);
        File tmpDir = null;
        try {
            tmpDir = Files.createTempDirectory("qdm_extract_").toFile();
            List<File> datFiles = new ArrayList<>();
            try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
                ZipEntry entry;
                byte[] buffer = new byte[65536];
                while ((entry = zis.getNextEntry()) != null) {
                    if (entry.getName().endsWith(".dat")) {
                        File outFile = new File(tmpDir, entry.getName());
                        try (FileOutputStream fos = new FileOutputStream(outFile);
                             BufferedOutputStream bos = new BufferedOutputStream(fos, 65536)) {
                            int len;
                            while ((len = zis.read(buffer)) > 0) {
                                bos.write(buffer, 0, len);
                            }
                        }
                        datFiles.add(outFile);
                    }
                    zis.closeEntry();
                }
            }
            datFiles.sort(Comparator.comparing(File::getName));
            DataOutputStream out = new DataOutputStream(new BufferedOutputStream(System.out, 1048576));
            
            long totalTicks = 0;
            for (File datFile : datFiles) {
                // IMPORTANT: create a fresh reader instance per dat file!
                TickDataBinReaderNew reader = new TickDataBinReaderNew();
                try {
                    reader.setFileName(datFile.getAbsolutePath());
                    reader.openFile();
                    while (reader.readData()) {
                        long t = reader.tickData.time;
                        double ask = reader.tickData.ask;
                        double bid = reader.tickData.bid;
                        
                        out.writeLong(t);
                        out.writeDouble(ask);
                        out.writeDouble(bid);
                        totalTicks++;
                    }
                } catch (Exception e) {
                    // end of file
                } finally {
                    try { reader.closeFile(); } catch (Exception ignored) {}
                    datFile.delete();
                }
            }
            out.flush();
            System.err.println("Processed " + zipFile.getName() + " -> " + totalTicks + " ticks.");
        } catch (Exception e) {
            e.printStackTrace(System.err);
            System.exit(1);
        } finally {
            if (tmpDir != null && tmpDir.exists()) {
                File[] list = tmpDir.listFiles();
                if (list != null) for (File f : list) f.delete();
                tmpDir.delete();
            }
        }
    }
}
