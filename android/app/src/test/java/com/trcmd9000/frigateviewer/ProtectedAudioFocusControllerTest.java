package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.media.AudioDeviceInfo;
import android.media.AudioManager;

import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ProtectedAudioFocusControllerTest {
  private FakePlatform platform;
  private final List<String> focusLosses = new ArrayList<>();
  private ProtectedAudioFocusController controller;

  @Before
  public void setUp() {
    platform = new FakePlatform();
    controller = new ProtectedAudioFocusController(platform, focusLosses::add);
  }

  @Test
  public void grantsFocusAndRestoresLegacyAudioManagerStateOnRelease() {
    platform.sdkInt = 24;
    platform.mode = AudioManager.MODE_NORMAL;
    platform.speakerphoneOn = false;

    final String token = controller.acquire(null);

    assertNotNull(token);
    assertTrue(controller.isActive());
    assertEquals(AudioManager.MODE_IN_COMMUNICATION, platform.mode);
    assertTrue(platform.speakerphoneOn);
    assertTrue(controller.release(token));
    assertEquals(AudioManager.MODE_NORMAL, platform.mode);
    assertFalse(platform.speakerphoneOn);
  }

  @Test
  public void deniedFocusDoesNotChangeAudioManagerState() {
    platform.requestResult = AudioManager.AUDIOFOCUS_REQUEST_FAILED;
    platform.mode = AudioManager.MODE_RINGTONE;
    platform.speakerphoneOn = true;

    assertNull(controller.acquire(null));

    assertFalse(controller.isActive());
    assertEquals(AudioManager.MODE_RINGTONE, platform.mode);
    assertTrue(platform.speakerphoneOn);
  }

  @Test
  public void deniedTakeoverNotifiesTheReplacedOwner() {
    final String ownerA = controller.acquire(null);
    platform.requestResult = AudioManager.AUDIOFOCUS_REQUEST_FAILED;

    assertNull(controller.acquire(null));
    assertEquals(Arrays.asList(ownerA), focusLosses);
    assertFalse(controller.isActive());
  }

  @Test
  public void externalFocusLossLeavesOurLastRouteUntouched() {
    final String token = controller.acquire(null);

    platform.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);

    assertFalse(controller.isActive());
    assertEquals(Arrays.asList(token), focusLosses);
    assertEquals(AudioManager.MODE_IN_COMMUNICATION, platform.mode);
    assertTrue(platform.speakerphoneOn);
  }

  @Test
  public void externalFocusLossDoesNotOverwriteMediaRouteOrMode() {
    platform.sdkInt = 31;
    final Device previous = new Device(15, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
    final Device speaker = new Device(16, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
    final Device mediaRoute = new Device(17, AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
    platform.communicationDevice = previous;
    platform.availableDevices = new ArrayList<>(Arrays.asList(previous, speaker, mediaRoute));

    controller.acquire(null);
    platform.mode = AudioManager.MODE_NORMAL;
    platform.communicationDevice = mediaRoute;

    platform.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);

    assertFalse(controller.isActive());
    assertEquals(AudioManager.MODE_NORMAL, platform.mode);
    assertEquals(mediaRoute, platform.communicationDevice);
    assertFalse(platform.clearedCommunicationDevice);
  }

  @Test
  public void externalLegacyFocusLossDoesNotOverwriteChangedRouteOrMode() {
    platform.sdkInt = 30;
    controller.acquire(null);
    platform.mode = AudioManager.MODE_NORMAL;
    platform.speakerphoneOn = false;

    platform.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);

    assertFalse(controller.isActive());
    assertEquals(AudioManager.MODE_NORMAL, platform.mode);
    assertFalse(platform.speakerphoneOn);
  }

  @Test
  public void staleOwnerCannotReleaseOrTakeOverTheCurrentOwner() {
    final String ownerA = controller.acquire(null);
    final String ownerB = controller.acquire(null);

    assertNotNull(ownerA);
    assertNotNull(ownerB);
    assertNotEquals(ownerA, ownerB);
    assertFalse(controller.release(ownerA));
    assertNull(controller.acquire(ownerA));
    assertTrue(controller.release(ownerB));
    final String ownerAAfterRemount = controller.acquire(null);
    assertNotNull(ownerAAfterRemount);
    assertTrue(controller.release(ownerAAfterRemount));
    assertEquals(Arrays.asList(ownerA), focusLosses);
  }

  @Test
  public void repeatedAcquireWithCurrentTokenAndReleaseAreIdempotent() {
    final String token = controller.acquire(null);

    assertEquals(token, controller.acquire(token));
    assertTrue(controller.release(token));
    assertFalse(controller.release(token));
    assertEquals(1, platform.requestCount);
    assertEquals(1, platform.abandonCount);
  }

  @Test
  public void api30UsesLegacySpeakerRoute() {
    platform.sdkInt = 30;
    platform.speakerphoneOn = false;

    final String token = controller.acquire(null);

    assertTrue(platform.speakerphoneOn);
    assertTrue(controller.release(token));
    assertFalse(platform.speakerphoneOn);
  }

  @Test
  public void api31RestoresAvailablePreviousBluetoothDevice() {
    platform.sdkInt = 31;
    final Device bluetooth = new Device(7, AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
    final Device speaker = new Device(8, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
    platform.communicationDevice = bluetooth;
    platform.availableDevices = new ArrayList<>(Arrays.asList(bluetooth, speaker));

    final String token = controller.acquire(null);

    assertEquals(speaker, platform.communicationDevice);
    assertTrue(controller.release(token));
    assertEquals(bluetooth, platform.communicationDevice);
    assertFalse(platform.clearedCommunicationDevice);
  }

  @Test
  public void api31RestoresAvailablePreviousBleHeadset() {
    platform.sdkInt = 31;
    final Device ble = new Device(11, AudioDeviceInfo.TYPE_BLE_HEADSET);
    final Device speaker = new Device(12, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
    platform.communicationDevice = ble;
    platform.availableDevices = new ArrayList<>(Arrays.asList(ble, speaker));

    final String token = controller.acquire(null);

    assertTrue(controller.release(token));
    assertEquals(ble, platform.communicationDevice);
  }

  @Test
  public void api31RestoresAvailablePreviousEarpiece() {
    platform.sdkInt = 31;
    final Device earpiece = new Device(13, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
    final Device speaker = new Device(14, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
    platform.communicationDevice = earpiece;
    platform.availableDevices = new ArrayList<>(Arrays.asList(earpiece, speaker));

    final String token = controller.acquire(null);

    assertTrue(controller.release(token));
    assertEquals(earpiece, platform.communicationDevice);
  }

  @Test
  public void api36ClearsWhenPreviousCommunicationDeviceDisappears() {
    platform.sdkInt = 36;
    final Device earpiece = new Device(9, 1);
    final Device speaker = new Device(10, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
    platform.communicationDevice = earpiece;
    platform.availableDevices = new ArrayList<>(Arrays.asList(earpiece, speaker));

    final String token = controller.acquire(null);
    platform.availableDevices = new ArrayList<>(Arrays.asList(speaker));

    assertTrue(controller.release(token));
    assertTrue(platform.clearedCommunicationDevice);
    assertNull(platform.communicationDevice);
  }

  @Test(expected = IllegalStateException.class)
  public void api31RejectsWhenBuiltInSpeakerIsUnavailable() {
    platform.sdkInt = 31;
    platform.availableDevices = new ArrayList<>();

    controller.acquire(null);
  }

  private static final class Device
      implements ProtectedAudioFocusController.Platform.CommunicationDevice {
    private final int id;
    private final int type;

    Device(int id, int type) {
      this.id = id;
      this.type = type;
    }

    @Override
    public int getId() {
      return id;
    }

    @Override
    public int getType() {
      return type;
    }
  }

  private static final class FakePlatform
      implements ProtectedAudioFocusController.Platform {
    int sdkInt = 24;
    int mode = AudioManager.MODE_NORMAL;
    boolean speakerphoneOn;
    int requestResult = AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    int requestCount;
    int abandonCount;
    boolean clearedCommunicationDevice;
    AudioManager.OnAudioFocusChangeListener listener;
    CommunicationDevice communicationDevice;
    List<CommunicationDevice> availableDevices = new ArrayList<>();

    @Override
    public int getSdkInt() {
      return sdkInt;
    }

    @Override
    public int getMode() {
      return mode;
    }

    @Override
    public boolean isSpeakerphoneOn() {
      return speakerphoneOn;
    }

    @Override
    public CommunicationDevice getCommunicationDevice() {
      return communicationDevice;
    }

    @Override
    public List<CommunicationDevice> getAvailableCommunicationDevices() {
      return availableDevices;
    }

    @Override
    public int requestAudioFocus(AudioManager.OnAudioFocusChangeListener focusListener) {
      requestCount++;
      listener = focusListener;
      return requestResult;
    }

    @Override
    public void abandonAudioFocus(AudioManager.OnAudioFocusChangeListener focusListener) {
      abandonCount++;
    }

    @Override
    public void setMode(int nextMode) {
      mode = nextMode;
    }

    @Override
    public void setSpeakerphoneOn(boolean enabled) {
      speakerphoneOn = enabled;
    }

    @Override
    public boolean setCommunicationDevice(CommunicationDevice device) {
      communicationDevice = device;
      return true;
    }

    @Override
    public void clearCommunicationDevice() {
      clearedCommunicationDevice = true;
      communicationDevice = null;
    }
  }
}
