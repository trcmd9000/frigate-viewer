package com.trcmd9000.frigateviewer;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Small, WebRTC-only bridge for explicit live-audio activation.
 */
public final class ProtectedAudioModule extends ReactContextBaseJavaModule
    implements LifecycleEventListener {
  static final String MODULE_NAME = "ProtectedAudioModule";
  static final String FOCUS_LOST_EVENT = "protectedAudioFocusLost";

  private final ReactApplicationContext reactContext;
  private final ProtectedAudioFocusController controller;
  private boolean invalidated;

  public ProtectedAudioModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    final AudioManager audioManager =
        (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
    this.controller = new ProtectedAudioFocusController(
        new AndroidAudioFocusPlatform(audioManager),
        this::emitFocusLost
    );
    reactContext.addLifecycleEventListener(this);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @ReactMethod
  public void addListener(String eventName) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  public void removeListeners(double count) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  public void acquireAudioFocus(String requestedOwnerToken, Promise promise) {
    if (invalidated) {
      promise.reject("MODULE_INVALIDATED", "Protected audio module is unavailable");
      return;
    }
    try {
      promise.resolve(controller.acquire(requestedOwnerToken));
    } catch (IllegalStateException | SecurityException error) {
      promise.reject("AUDIO_FOCUS_ERROR", "Unable to configure protected audio", error);
    }
  }

  @ReactMethod
  public void releaseAudio(String ownerToken) {
    if (invalidated || ownerToken == null) {
      return;
    }
    if (controller.release(ownerToken)) {
      emitFocusLost(ownerToken);
    }
  }

  @Override
  public void onHostResume() {}

  @Override
  public void onHostPause() {
    releaseForLifecycle();
  }

  @Override
  public void onHostDestroy() {
    releaseForLifecycle();
  }

  @Override
  public void invalidate() {
    invalidated = true;
    releaseForLifecycle();
    reactContext.removeLifecycleEventListener(this);
    super.invalidate();
  }

  private void releaseForLifecycle() {
    final String ownerToken = controller.getOwnerToken();
    if (ownerToken != null && controller.release(ownerToken)) {
      emitFocusLost(ownerToken);
    }
  }

  private void emitFocusLost(String ownerToken) {
    if (invalidated || ownerToken == null) {
      return;
    }
    final WritableMap payload = Arguments.createMap();
    payload.putString("ownerToken", ownerToken);
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(FOCUS_LOST_EVENT, payload);
  }

  private static final class AndroidAudioFocusPlatform
      implements ProtectedAudioFocusController.Platform {
    private final AudioManager audioManager;
    private final AudioAttributes audioAttributes;
    private AudioFocusRequest audioFocusRequest;

    AndroidAudioFocusPlatform(AudioManager audioManager) {
      if (audioManager == null) {
        throw new IllegalStateException("Android audio service is unavailable");
      }
      this.audioManager = audioManager;
      this.audioAttributes = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build();
    }

    @Override
    public int getSdkInt() {
      return Build.VERSION.SDK_INT;
    }

    @Override
    public int getMode() {
      return audioManager.getMode();
    }

    @Override
    public boolean isSpeakerphoneOn() {
      return audioManager.isSpeakerphoneOn();
    }

    @Override
    public CommunicationDevice getCommunicationDevice() {
      if (Build.VERSION.SDK_INT < 31) {
        return null;
      }
      return wrap(audioManager.getCommunicationDevice());
    }

    @Override
    public List<CommunicationDevice> getAvailableCommunicationDevices() {
      if (Build.VERSION.SDK_INT < 31) {
        return Collections.emptyList();
      }
      final AudioDeviceInfo[] devices = audioManager.getAvailableCommunicationDevices()
          .toArray(new AudioDeviceInfo[0]);
      final List<CommunicationDevice> wrapped = new ArrayList<>(devices.length);
      for (AudioDeviceInfo device : devices) {
        wrapped.add(wrap(device));
      }
      return wrapped;
    }

    @Override
    public int requestAudioFocus(AudioManager.OnAudioFocusChangeListener listener) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(audioAttributes)
            .setOnAudioFocusChangeListener(listener)
            .setWillPauseWhenDucked(true)
            .build();
        return audioManager.requestAudioFocus(audioFocusRequest);
      }
      return audioManager.requestAudioFocus(
          listener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN
      );
    }

    @Override
    public void abandonAudioFocus(AudioManager.OnAudioFocusChangeListener listener) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
        audioManager.abandonAudioFocusRequest(audioFocusRequest);
        audioFocusRequest = null;
        return;
      }
      audioManager.abandonAudioFocus(listener);
    }

    @Override
    public void setMode(int mode) {
      audioManager.setMode(mode);
    }

    @Override
    public void setSpeakerphoneOn(boolean enabled) {
      audioManager.setSpeakerphoneOn(enabled);
    }

    @Override
    public boolean setCommunicationDevice(CommunicationDevice device) {
      if (!(device instanceof AndroidCommunicationDevice) || Build.VERSION.SDK_INT < 31) {
        throw new IllegalArgumentException("Invalid communication device");
      }
      return audioManager.setCommunicationDevice(
          ((AndroidCommunicationDevice) device).device
      );
    }

    @Override
    public void clearCommunicationDevice() {
      if (Build.VERSION.SDK_INT >= 31) {
        audioManager.clearCommunicationDevice();
      }
    }

    private static CommunicationDevice wrap(AudioDeviceInfo device) {
      return device == null ? null : new AndroidCommunicationDevice(device);
    }
  }

  private static final class AndroidCommunicationDevice
      implements ProtectedAudioFocusController.Platform.CommunicationDevice {
    private final AudioDeviceInfo device;

    AndroidCommunicationDevice(AudioDeviceInfo device) {
      this.device = device;
    }

    @Override
    public int getId() {
      return device.getId();
    }

    @Override
    public int getType() {
      return device.getType();
    }
  }
}
