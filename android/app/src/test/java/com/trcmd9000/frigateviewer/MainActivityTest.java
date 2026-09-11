package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MainActivityTest {
  @Test
  public void enablesTheSystemBackBridgeFromAndroidThirteen() {
    assertFalse(MainActivity.supportsSystemBackBridge(32));
    assertTrue(MainActivity.supportsSystemBackBridge(33));
    assertTrue(MainActivity.supportsSystemBackBridge(35));
  }
}