package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

public class ProtectedMseMp4ProbeTest {
  @Test
  public void recognizesFragmentedMp4AcrossMessageBoundaries() throws Exception {
    byte[] stream = concat(
      box("ftyp", new byte[] {1, 2, 3}),
      box("moov", new byte[] {4}),
      box("moof", new byte[] {5, 6}),
      box("mdat", new byte[] {7, 8, 9, 10})
    );
    ProtectedMseMp4Probe probe = new ProtectedMseMp4Probe();

    probe.accept(slice(stream, 0, 5));
    assertFalse(probe.isComplete());
    probe.accept(slice(stream, 5, 19));
    assertFalse(probe.isComplete());
    probe.accept(slice(stream, 19, stream.length));

    assertTrue(probe.isComplete());
    assertTrue(probe.hasFtyp());
    assertTrue(probe.hasMoov());
    assertTrue(probe.hasMoof());
    assertTrue(probe.hasMdat());
    assertEquals(stream.length, probe.totalBytes());
  }

  @Test(expected = IOException.class)
  public void rejectsUnboundedBoxes() throws Exception {
    ProtectedMseMp4Probe probe = new ProtectedMseMp4Probe();
    probe.accept(new byte[] {0, 0, 0, 0, 'm', 'd', 'a', 't'});
  }

  @Test(expected = IOException.class)
  public void rejectsMessagesAboveTheBoundedQueueLimit() throws Exception {
    ProtectedMseMp4Probe probe = new ProtectedMseMp4Probe();
    probe.accept(new byte[ProtectedMseMp4Probe.MAX_MESSAGE_BYTES + 1]);
  }

  private static byte[] box(String type, byte[] payload) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    int size = 8 + payload.length;
    output.write(new byte[] {
      (byte) (size >>> 24),
      (byte) (size >>> 16),
      (byte) (size >>> 8),
      (byte) size
    });
    output.write(type.getBytes(StandardCharsets.US_ASCII));
    output.write(payload);
    return output.toByteArray();
  }

  private static byte[] concat(byte[]... values) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    for (byte[] value : values) {
      output.write(value);
    }
    return output.toByteArray();
  }

  private static byte[] slice(byte[] value, int start, int end) {
    byte[] result = new byte[end - start];
    System.arraycopy(value, start, result, 0, result.length);
    return result;
  }
}
