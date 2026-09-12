package com.trcmd9000.frigateviewer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

final class ProtectedMseMp4Probe {
  static final long MAX_TOTAL_BYTES = 2L * 1024L * 1024L;
  static final int MAX_MESSAGE_BYTES = (int) MAX_TOTAL_BYTES;
  private static final long MAX_BOX_BYTES = 256L * 1024L * 1024L;

  private final byte[] header = new byte[16];
  private int headerLength;
  private int headerTarget = 8;
  private long remainingPayloadBytes;
  private long totalBytes;
  private boolean ftyp;
  private boolean moov;
  private boolean moof;
  private boolean mdat;

  void accept(byte[] data) throws IOException {
    if (data == null || data.length == 0) {
      return;
    }
    if (isComplete()) {
      return;
    }
    if (data.length > MAX_MESSAGE_BYTES || totalBytes + data.length > MAX_TOTAL_BYTES) {
      throw new IOException("The protected MSE probe exceeded its byte budget");
    }
    totalBytes += data.length;
    int offset = 0;
    while (offset < data.length && !isComplete()) {
      if (remainingPayloadBytes > 0) {
        int skipped = (int) Math.min(remainingPayloadBytes, data.length - offset);
        remainingPayloadBytes -= skipped;
        offset += skipped;
        continue;
      }

      int copied = Math.min(headerTarget - headerLength, data.length - offset);
      System.arraycopy(data, offset, header, headerLength, copied);
      headerLength += copied;
      offset += copied;
      if (headerLength < headerTarget) {
        continue;
      }

      long boxSize = unsignedInt(header, 0);
      if (headerTarget == 8 && boxSize == 1) {
        headerTarget = 16;
        continue;
      }
      int boxHeaderBytes = headerTarget;
      if (boxSize == 1) {
        boxSize = unsignedLong(header, 8);
      }
      if (boxSize == 0 || boxSize < boxHeaderBytes || boxSize > MAX_BOX_BYTES) {
        throw new IOException("The protected MSE stream contains an invalid MP4 box");
      }
      recordBox(new String(header, 4, 4, StandardCharsets.US_ASCII));
      remainingPayloadBytes = boxSize - boxHeaderBytes;
      headerLength = 0;
      headerTarget = 8;
    }
  }

  boolean isComplete() {
    return ftyp && moov && moof && mdat;
  }

  long totalBytes() {
    return totalBytes;
  }

  boolean hasFtyp() {
    return ftyp;
  }

  boolean hasMoov() {
    return moov;
  }

  boolean hasMoof() {
    return moof;
  }

  boolean hasMdat() {
    return mdat;
  }

  private void recordBox(String type) {
    if ("ftyp".equals(type)) {
      ftyp = true;
    } else if ("moov".equals(type)) {
      moov = true;
    } else if ("moof".equals(type)) {
      moof = true;
    } else if ("mdat".equals(type)) {
      mdat = true;
    }
  }

  private static long unsignedInt(byte[] value, int offset) {
    return ((long) value[offset] & 0xffL) << 24 |
      ((long) value[offset + 1] & 0xffL) << 16 |
      ((long) value[offset + 2] & 0xffL) << 8 |
      ((long) value[offset + 3] & 0xffL);
  }

  private static long unsignedLong(byte[] value, int offset) throws IOException {
    if ((value[offset] & 0x80) != 0) {
      throw new IOException("The protected MSE stream contains an oversized MP4 box");
    }
    long result = 0;
    for (int index = 0; index < 8; index++) {
      result = (result << 8) | ((long) value[offset + index] & 0xffL);
    }
    return result;
  }
}
