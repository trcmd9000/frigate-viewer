package com.trcmd9000.frigateviewer;

import android.media.AudioManager;
import android.media.AudioDeviceInfo;

import java.util.List;
import java.util.UUID;

/**
 * Owns the process-wide protected WebRTC audio lease. A new owner deterministically
 * takes over the previous owner; release is accepted only for the current token.
 */
final class ProtectedAudioFocusController {
  interface Platform {
    interface CommunicationDevice {
      int getId();

      int getType();
    }

    int getSdkInt();

    int getMode();

    boolean isSpeakerphoneOn();

    CommunicationDevice getCommunicationDevice();

    List<CommunicationDevice> getAvailableCommunicationDevices();

    int requestAudioFocus(AudioManager.OnAudioFocusChangeListener listener);

    void abandonAudioFocus(AudioManager.OnAudioFocusChangeListener listener);

    void setMode(int mode);

    void setSpeakerphoneOn(boolean enabled);

    boolean setCommunicationDevice(CommunicationDevice device);

    void clearCommunicationDevice();
  }

  interface Listener {
    void onFocusLost(String ownerToken);
  }

  private final Object lock = new Object();
  private final Platform platform;
  private final Listener listener;
  private final AudioManager.OnAudioFocusChangeListener focusListener =
      this::handleFocusChange;
  private boolean active;
  private boolean requesting;
  private boolean focusLostDuringRequest;
  private int previousMode;
  private boolean previousSpeakerphoneOn;
  private Platform.CommunicationDevice previousCommunicationDevice;
  private String ownerToken;
  private boolean ownerModeSet;
  private boolean ownerSpeakerphoneSet;
  private boolean ownerCommunicationDeviceSet;
  private int ownerMode;
  private boolean ownerSpeakerphoneOn;
  private Platform.CommunicationDevice ownerCommunicationDevice;

  ProtectedAudioFocusController(Platform platform, Listener listener) {
    this.platform = platform;
    this.listener = listener;
  }

  String acquire(String requestedOwnerToken) {
    String replacedOwner;
    String acquiredOwner;
    synchronized (lock) {
      if (requestedOwnerToken != null) {
        if (!requestedOwnerToken.equals(ownerToken) || !active) {
          return null;
        }
        return ownerToken;
      }

      replacedOwner = ownerToken;
      if (active) {
        releaseLocked(true);
        if (replacedOwner != null) {
          listener.onFocusLost(replacedOwner);
        }
        replacedOwner = null;
      }

      previousMode = platform.getMode();
      previousSpeakerphoneOn = platform.isSpeakerphoneOn();
      previousCommunicationDevice =
          platform.getSdkInt() >= 31
              ? platform.getCommunicationDevice()
              : null;
      requesting = true;
      focusLostDuringRequest = false;
      final int focusResult;
      try {
        focusResult = platform.requestAudioFocus(focusListener);
      } finally {
        requesting = false;
      }
      if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED ||
          focusLostDuringRequest) {
        platform.abandonAudioFocus(focusListener);
        focusLostDuringRequest = false;
        ownerToken = null;
        return null;
      }

      acquiredOwner = UUID.randomUUID().toString();
      ownerToken = acquiredOwner;
      active = true;
      try {
        ownerMode = AudioManager.MODE_IN_COMMUNICATION;
        platform.setMode(ownerMode);
        ownerModeSet = true;
        configureOutputRoute();
      } catch (IllegalStateException | SecurityException error) {
        releaseLocked(true);
        throw error;
      }
    }
    if (replacedOwner != null) {
      listener.onFocusLost(replacedOwner);
    }
    return acquiredOwner;
  }

  boolean release(String requestedOwnerToken) {
    synchronized (lock) {
      if (!active ||
          requestedOwnerToken == null ||
          !requestedOwnerToken.equals(ownerToken)) {
        return false;
      }
      releaseLocked(true);
      return true;
    }
  }

  boolean isActive() {
    synchronized (lock) {
      return active;
    }
  }

  String getOwnerToken() {
    synchronized (lock) {
      return ownerToken;
    }
  }

  private void configureOutputRoute() {
    if (platform.getSdkInt() < 31) {
      platform.setSpeakerphoneOn(true);
      ownerSpeakerphoneOn = true;
      ownerSpeakerphoneSet = true;
      return;
    }
    final Platform.CommunicationDevice speaker =
        platform.getAvailableCommunicationDevices().stream()
            .filter(device -> device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
            .findFirst()
            .orElse(null);
    if (speaker == null || !platform.setCommunicationDevice(speaker)) {
      throw new IllegalStateException("Built-in speaker route is unavailable");
    }
    ownerCommunicationDevice = speaker;
    ownerCommunicationDeviceSet = true;
  }

  private void handleFocusChange(int focusChange) {
    if (focusChange >= 0) {
      return;
    }
    final String lostOwner;
    synchronized (lock) {
      if (requesting) {
        focusLostDuringRequest = true;
        return;
      }
      if (!active) {
        return;
      }
      lostOwner = ownerToken;
      releaseLocked(false);
    }
    if (lostOwner != null) {
      listener.onFocusLost(lostOwner);
    }
  }

  private void releaseLocked(boolean restoreOwnedState) {
    if (!active) {
      return;
    }
    active = false;
    final String releasedOwner = ownerToken;
    ownerToken = null;
    platform.abandonAudioFocus(focusListener);
    try {
      if (restoreOwnedState) {
        restoreOutputRoute();
      }
    } finally {
      clearOwnerState();
    }
    if (releasedOwner == null) {
      throw new IllegalStateException("Protected audio owner is missing");
    }
  }

  private void clearOwnerState() {
    ownerModeSet = false;
    ownerSpeakerphoneSet = false;
    ownerCommunicationDeviceSet = false;
    ownerCommunicationDevice = null;
  }

  private void restoreOutputRoute() {
    if (platform.getSdkInt() < 31) {
      if (ownerSpeakerphoneSet &&
          platform.isSpeakerphoneOn() == ownerSpeakerphoneOn) {
        platform.setSpeakerphoneOn(previousSpeakerphoneOn);
      }
      if (ownerModeSet && platform.getMode() == ownerMode) {
        platform.setMode(previousMode);
      }
      return;
    }
    if (ownerCommunicationDeviceSet &&
        sameDevice(platform.getCommunicationDevice(), ownerCommunicationDevice)) {
      if (previousCommunicationDevice != null &&
          isAvailable(previousCommunicationDevice)) {
        if (!platform.setCommunicationDevice(previousCommunicationDevice)) {
          throw new IllegalStateException(
              "Previous communication route could not be restored");
        }
      } else {
        platform.clearCommunicationDevice();
      }
    }
    if (ownerModeSet && platform.getMode() == ownerMode) {
      platform.setMode(previousMode);
    }
  }

  private boolean sameDevice(
      Platform.CommunicationDevice first,
      Platform.CommunicationDevice second
  ) {
    return first != null &&
        second != null &&
        first.getId() == second.getId() &&
        first.getType() == second.getType();
  }

  private boolean isAvailable(Platform.CommunicationDevice device) {
    return platform.getAvailableCommunicationDevices().stream()
        .anyMatch(candidate ->
            candidate.getId() == device.getId() &&
            candidate.getType() == device.getType());
  }
}
