// -----------------------------------------------------------------------------
// Device type: VIDEO DOORBELL (August View, Yale Smart Video Doorbell…).
//
// Features:
//   - camera   camera/image — the latest snapshot, published through the
//              dedicated camera image channel (never a state)
//   - ring     doorbell/ring: 1 for a few seconds when the button is pressed
//   - motion   motion-sensor/binary: 1 for a few seconds on a detection
//   - battery  battery/integer, % — battery-powered doorbells only
//
// The live video stream is out of scope (Gladys takes still images).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';

export const DOORBELL_DEVICE_TYPE = 'doorbell';

export const DOORBELL_FEATURES = {
  CAMERA: 'camera',
  RING: 'ring',
  MOTION: 'motion',
  BATTERY: 'battery',
};

export function doorbellIds(gladys, doorbellId) {
  return gladys.externalIds(DOORBELL_DEVICE_TYPE, doorbellId);
}

/**
 * Discovery payload of one doorbell.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {ReturnType<import('../august/parsers.js').parseDoorbell>} doorbell
 */
export function buildDoorbellDevice(gladys, doorbell) {
  const ids = doorbellIds(gladys, doorbell.id);
  const features = [
    {
      name: 'Camera',
      external_id: ids.feature(DOORBELL_FEATURES.CAMERA),
      category: DEVICE_FEATURE_CATEGORIES.CAMERA,
      type: DEVICE_FEATURE_TYPES.CAMERA.IMAGE,
      read_only: true,
      has_feedback: false,
      keep_history: false,
    },
    {
      name: 'Ring',
      external_id: ids.feature(DOORBELL_FEATURES.RING),
      category: DEVICE_FEATURE_CATEGORIES.DOORBELL,
      type: DEVICE_FEATURE_TYPES.DOORBELL.RING,
      min: 0,
      max: 1,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Motion',
      external_id: ids.feature(DOORBELL_FEATURES.MOTION),
      category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      min: 0,
      max: 1,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
  ];
  if (doorbell.battery !== null) {
    features.push({
      name: 'Battery',
      external_id: ids.feature(DOORBELL_FEATURES.BATTERY),
      category: DEVICE_FEATURE_CATEGORIES.BATTERY,
      type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    });
  }
  return {
    name: doorbell.name,
    external_id: ids.device,
    params: [
      { name: 'august_doorbell_id', value: doorbell.id },
      ...(doorbell.serialNumber ? [{ name: 'serial_number', value: doorbell.serialNumber }] : []),
      ...(doorbell.firmware ? [{ name: 'firmware', value: String(doorbell.firmware) }] : []),
    ],
    features,
  };
}

/** The `publishStates` entries describing a doorbell (the battery only). */
export function doorbellStates(gladys, doorbell) {
  if (doorbell.battery === null) {
    return [];
  }
  return [
    {
      device_feature_external_id: doorbellIds(gladys, doorbell.id).feature(
        DOORBELL_FEATURES.BATTERY,
      ),
      state: doorbell.battery,
    },
  ];
}

export function doorbellTransport(gladys, doorbell) {
  return {
    external_id: doorbellIds(gladys, doorbell.id).device,
    transport: doorbell.online ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
  };
}
