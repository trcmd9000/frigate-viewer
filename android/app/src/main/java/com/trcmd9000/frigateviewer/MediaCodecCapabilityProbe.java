package com.trcmd9000.frigateviewer;

import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.os.Build;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Reads static HEVC decoder capabilities without opening a codec or touching media.
 * Only aggregate capability facts cross the React Native boundary.
 */
final class MediaCodecCapabilityProbe {
  private static final String HEVC_MIME = "video/hevc";

  private MediaCodecCapabilityProbe() {}

  static WritableMap probe() {
    MediaCodecInfo[] infos;
    try {
      infos = new MediaCodecList(MediaCodecList.ALL_CODECS).getCodecInfos();
    } catch (RuntimeException ignored) {
      return unknownResult();
    }
    try {
      return probe(infos);
    } catch (RuntimeException ignored) {
      return availabilityOnlyResult(infos);
    }
  }

  static WritableMap probe(MediaCodecInfo[] infos) {
    if (infos == null) {
      return unknownResult();
    }
    WritableMap result = baseResult();
    WritableArray profileLevels = Arguments.createArray();
    result.putArray("profileLevels", profileLevels);
    int maxWidth = 0;
    int maxHeight = 0;
    double maxFrameRate = 0;
    Set<String> seenProfiles = new HashSet<>();
    boolean classifyHardware = supportsHardwareClassification(Build.VERSION.SDK_INT);
    for (MediaCodecInfo info : infos) {
      try {
        if (info == null || info.isEncoder()) {
          continue;
        }
        String hevcType = findHevcType(info.getSupportedTypes());
        if (hevcType == null) {
          continue;
        }
        MediaCodecInfo.CodecCapabilities capabilities;
        try {
          capabilities = info.getCapabilitiesForType(hevcType);
        } catch (IllegalArgumentException ignored) {
          continue;
        }
        if (capabilities == null) {
          continue;
        }
        result.putBoolean("hevcDecoderAvailable", true);

        if (classifyHardware) {
          if (info.isHardwareAccelerated()) {
            result.putBoolean("hevcHardwareDecoderAvailable", true);
          }
          if (info.isSoftwareOnly()) {
            result.putBoolean("hevcSoftwareDecoderAvailable", true);
          }
        }

        if (capabilities.profileLevels != null) {
          for (MediaCodecInfo.CodecProfileLevel profileLevel : capabilities.profileLevels) {
            if (profileLevel == null) {
              continue;
            }
            String key = profileLevel.profile + ":" + profileLevel.level;
            seenProfiles.add(key);
          }
        }

        if (capabilities.getVideoCapabilities() != null) {
          android.util.Range<Integer> widths =
              capabilities.getVideoCapabilities().getSupportedWidths();
          android.util.Range<Integer> heights =
              capabilities.getVideoCapabilities().getSupportedHeights();
          android.util.Range<Integer> frameRates =
              capabilities.getVideoCapabilities().getSupportedFrameRates();
          if (widths != null && widths.getUpper() != null) {
            maxWidth = Math.max(maxWidth, widths.getUpper());
          }
          if (heights != null && heights.getUpper() != null) {
            maxHeight = Math.max(maxHeight, heights.getUpper());
          }
          if (frameRates != null && frameRates.getUpper() != null) {
            maxFrameRate = Math.max(maxFrameRate, frameRates.getUpper().doubleValue());
          }
        }
      } catch (RuntimeException ignored) {
        // A broken vendor entry must not hide capabilities from other codecs.
      }
    }

    List<String> sortedProfiles = new ArrayList<>(seenProfiles);
    Collections.sort(sortedProfiles);
    for (String key : sortedProfiles) {
      String[] values = key.split(":", 2);
      if (values.length != 2) {
        continue;
      }
      try {
        WritableMap profile = Arguments.createMap();
        int profileValue = Integer.parseInt(values[0]);
        int levelValue = Integer.parseInt(values[1]);
        if (profileValue < 0 || levelValue < 0) {
          continue;
        }
        profile.putInt("profile", profileValue);
        profile.putInt("level", levelValue);
        profileLevels.pushMap(profile);
      } catch (NumberFormatException ignored) {
        // MediaCodec profile and level values are expected to be integers.
      }
    }

    if (classifyHardware) {
      result.putString(
          "hevcHardwareClassification",
          result.getBoolean("hevcHardwareDecoderAvailable") ? "supported" : "unsupported");
      result.putString(
          "hevcSoftwareClassification",
          result.getBoolean("hevcSoftwareDecoderAvailable") ? "supported" : "unsupported");
    } else {
      result.putNull("hevcHardwareDecoderAvailable");
      result.putNull("hevcSoftwareDecoderAvailable");
    }
    if (maxWidth > 0) {
      result.putInt("maxWidth", maxWidth);
    }
    if (maxHeight > 0) {
      result.putInt("maxHeight", maxHeight);
    }
    if (maxFrameRate > 0) {
      result.putDouble("maxFrameRate", maxFrameRate);
    }
    return result;
  }

  private static WritableMap unknownResult() {
    WritableMap result = baseResult();
    result.putNull("hevcDecoderAvailable");
    result.putNull("hevcHardwareDecoderAvailable");
    result.putNull("hevcSoftwareDecoderAvailable");
    result.putString("hevcHardwareClassification", "unknown");
    result.putString("hevcSoftwareClassification", "unknown");
    return result;
  }

  private static WritableMap availabilityOnlyResult(MediaCodecInfo[] infos) {
    WritableMap result = unknownResult();
    if (infos == null) {
      return result;
    }
    for (MediaCodecInfo info : infos) {
      try {
        if (info != null && !info.isEncoder() && findHevcType(info.getSupportedTypes()) != null) {
          result.putBoolean("hevcDecoderAvailable", true);
          return result;
        }
      } catch (RuntimeException ignored) {
        // Continue past broken vendor entries; MIME advertisement is sufficient here.
      }
    }
    result.putBoolean("hevcDecoderAvailable", false);
    return result;
  }

  private static WritableMap baseResult() {
    WritableMap result = Arguments.createMap();
    result.putInt("apiLevel", Build.VERSION.SDK_INT);
    result.putBoolean("hevcDecoderAvailable", false);
    result.putBoolean("hevcHardwareDecoderAvailable", false);
    result.putBoolean("hevcSoftwareDecoderAvailable", false);
    result.putString("hevcHardwareClassification", "unknown");
    result.putString("hevcSoftwareClassification", "unknown");
    WritableArray profileLevels = Arguments.createArray();
    result.putArray("profileLevels", profileLevels);
    return result;
  }

  static boolean supportsHardwareClassification(int apiLevel) {
    return apiLevel >= 29;
  }

  static String findHevcType(String[] supportedTypes) {
    if (supportedTypes == null) {
      return null;
    }
    for (String supportedType : supportedTypes) {
      if (HEVC_MIME.equalsIgnoreCase(supportedType)) {
        return supportedType;
      }
    }
    return null;
  }
}
