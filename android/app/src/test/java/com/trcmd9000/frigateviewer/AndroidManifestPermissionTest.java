package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

public class AndroidManifestPermissionTest {
  @Test
  public void declaresOnlyTheAudioSettingPermissionNeededByProtectedAudio() throws IOException {
    final Path moduleManifest = Paths.get("src/main/AndroidManifest.xml");
    final Path rootManifest = Paths.get("android/app/src/main/AndroidManifest.xml");
    final Path manifest = Files.exists(moduleManifest) ? moduleManifest : rootManifest;
    final String xml = new String(Files.readAllBytes(manifest), StandardCharsets.UTF_8);

    assertTrue(xml.contains("android.permission.MODIFY_AUDIO_SETTINGS"));
    assertFalse(xml.contains("android.permission.RECORD_AUDIO"));
    assertFalse(xml.contains("android.permission.BLUETOOTH_CONNECT"));
    assertFalse(xml.contains("android.permission.BLUETOOTH_SCAN"));
  }
}
