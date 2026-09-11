package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Method;
import org.junit.Test;

public class MediaCodecCapabilityProbeTest {
  @Test
  public void keepsTheProbeEntryPointAndApiGuardsStable() throws Exception {
    Method probe = MediaCodecCapabilityProbe.class.getDeclaredMethod("probe");
    assertTrue(probe.getReturnType().getName().contains("WritableMap"));
    assertTrue(!MediaCodecCapabilityProbe.supportsHardwareClassification(24));
    assertFalse(MediaCodecCapabilityProbe.supportsHardwareClassification(28));
    assertTrue(MediaCodecCapabilityProbe.supportsHardwareClassification(29));
    assertTrue(MediaCodecCapabilityProbe.supportsHardwareClassification(36));
  }

  @Test
  public void findsTheAdvertisedHevcMimeTypeCaseInsensitively() {
    assertEquals(
        "Video/HEVC",
        MediaCodecCapabilityProbe.findHevcType(new String[] {"video/avc", "Video/HEVC"}));
    assertNull(MediaCodecCapabilityProbe.findHevcType(new String[] {"video/avc"}));
    assertNull(MediaCodecCapabilityProbe.findHevcType(null));
  }
}
