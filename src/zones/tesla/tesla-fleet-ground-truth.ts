/**
 * Tesla Fleet API / Owner-style payload — checklist for integration QA.
 * Field names follow common vehicle_data composite JSON (may vary by firmware / region).
 */

export type TeslaGroundTruthItem = {
  id: string
  label: string
  /** Typical JSON path or Fleet telemetry concept */
  pathHint: string
}

export type TeslaGroundTruthGroup = {
  id: string
  title: string
  description?: string
  items: TeslaGroundTruthItem[]
}

export const TESLA_FLEET_GROUND_TRUTH: TeslaGroundTruthGroup[] = [
  {
    id: 'vehicle',
    title: 'Vehicle identity & session',
    description: 'Registration, tokens, online state',
    items: [
      { id: 'vin', label: 'Vehicle identification number', pathHint: 'response.vin' },
      { id: 'id-s', label: 'Stable string id', pathHint: 'response.id_s' },
      { id: 'display-name', label: 'Display / nickname', pathHint: 'response.display_name' },
      { id: 'state', label: 'Online / asleep / offline', pathHint: 'response.state' },
      { id: 'option-codes', label: 'Factory option codes', pathHint: 'response.option_codes' },
      { id: 'calendar-enabled', label: 'Calendar integration flag', pathHint: 'response.calendar_enabled' },
      { id: 'in-service', label: 'Service mode flag', pathHint: 'response.in_service' },
    ],
  },
  {
    id: 'vehicle-state',
    title: 'vehicle_state',
    description: 'Body, locks, odometer, software',
    items: [
      { id: 'odometer', label: 'Odometer', pathHint: 'vehicle_state.odometer' },
      { id: 'locked', label: 'Locked', pathHint: 'vehicle_state.locked' },
      { id: 'car-version', label: 'Firmware version string', pathHint: 'vehicle_state.car_version' },
      { id: 'software-update', label: 'OTA status object', pathHint: 'vehicle_state.software_update' },
      { id: 'sentry-mode', label: 'Sentry mode', pathHint: 'vehicle_state.sentry_mode' },
      { id: 'remote-start', label: 'Remote start enabled / active', pathHint: 'vehicle_state.remote_start*' },
      { id: 'valet-mode', label: 'Valet mode', pathHint: 'vehicle_state.valet_mode' },
      { id: 'sun-roof', label: 'Sunroof percent / state', pathHint: 'vehicle_state.sun_roof_*' },
      { id: 'speed-limit-mode', label: 'Speed limit mode', pathHint: 'vehicle_state.speed_limit_mode' },
      { id: 'media-state', label: 'Media / theater hints', pathHint: 'vehicle_state.media_state' },
    ],
  },
  {
    id: 'charge-state',
    title: 'charge_state',
    description: 'Battery, charging session, limits',
    items: [
      { id: 'battery-level', label: 'Battery SOC %', pathHint: 'charge_state.battery_level' },
      { id: 'usable-battery-level', label: 'Usable SOC %', pathHint: 'charge_state.usable_battery_level' },
      { id: 'battery-range', label: 'Rated range (mi/km per GUI)', pathHint: 'charge_state.battery_range' },
      { id: 'est-battery-range', label: 'Estimated range', pathHint: 'charge_state.est_battery_range' },
      { id: 'ideal-battery-range', label: 'Ideal range', pathHint: 'charge_state.ideal_battery_range' },
      { id: 'charge-limit-soc', label: 'Charge limit %', pathHint: 'charge_state.charge_limit_soc' },
      { id: 'charging-state', label: 'Charging state enum', pathHint: 'charge_state.charging_state' },
      { id: 'charger-power', label: 'AC charge power (kW)', pathHint: 'charge_state.charger_power' },
      { id: 'charger-voltage', label: 'Voltage', pathHint: 'charge_state.charger_voltage' },
      { id: 'charge-energy-added', label: 'Session energy added', pathHint: 'charge_state.charge_energy_added' },
      { id: 'fast-charger-type', label: 'Supercharger / DC type', pathHint: 'charge_state.fast_charger_*' },
      { id: 'time-to-full', label: 'Minutes to full charge', pathHint: 'charge_state.time_to_full_charge' },
      { id: 'battery-heater', label: 'Battery heater on', pathHint: 'charge_state.battery_heater_on' },
      { id: 'scheduled-charging', label: 'Scheduled charging window', pathHint: 'charge_state.scheduled_charging_*' },
    ],
  },
  {
    id: 'climate-state',
    title: 'climate_state',
    description: 'HVAC, temps, seat heat',
    items: [
      { id: 'inside-temp', label: 'Interior temperature', pathHint: 'climate_state.inside_temp' },
      { id: 'outside-temp', label: 'Exterior temperature', pathHint: 'climate_state.outside_temp' },
      { id: 'is-climate-on', label: 'Climate running', pathHint: 'climate_state.is_climate_on' },
      { id: 'fan-status', label: 'Fan level', pathHint: 'climate_state.fan_status' },
      { id: 'driver-temp-setting', label: 'Driver setpoint', pathHint: 'climate_state.driver_temp_setting' },
      { id: 'passenger-temp-setting', label: 'Passenger setpoint', pathHint: 'climate_state.passenger_temp_setting' },
      { id: 'defrost', label: 'Front / rear defrost', pathHint: 'climate_state.is_*_defroster_on' },
      { id: 'steering-wheel-heater', label: 'Steering wheel heat', pathHint: 'climate_state.steering_wheel_heater' },
      { id: 'seat-heaters', label: 'Seat heater levels', pathHint: 'climate_state.seat_heater_*' },
      { id: 'cabin-overheat', label: 'Cabin overheat protection', pathHint: 'climate_state.cabin_overheat_protection*' },
      { id: 'preconditioning', label: 'Preconditioning flag', pathHint: 'climate_state.is_preconditioning' },
    ],
  },
  {
    id: 'drive-state',
    title: 'drive_state',
    description: 'GPS, heading, motion',
    items: [
      { id: 'latitude', label: 'Latitude', pathHint: 'drive_state.latitude' },
      { id: 'longitude', label: 'Longitude', pathHint: 'drive_state.longitude' },
      { id: 'heading', label: 'Heading (deg)', pathHint: 'drive_state.heading' },
      { id: 'speed', label: 'Speed', pathHint: 'drive_state.speed' },
      { id: 'gps-as-of', label: 'GPS fix timestamp', pathHint: 'drive_state.gps_as_of' },
      { id: 'shift-state', label: 'Park / drive / reverse', pathHint: 'drive_state.shift_state' },
      { id: 'power', label: 'Instantaneous power (when streamed)', pathHint: 'drive_state.power' },
      { id: 'active-route', label: 'Nav route hints', pathHint: 'drive_state.active_route_*' },
    ],
  },
  {
    id: 'vehicle-config',
    title: 'vehicle_config',
    description: 'Trim, wheels, market options',
    items: [
      { id: 'car-type', label: 'Model designation', pathHint: 'vehicle_config.car_type' },
      { id: 'trim-badging', label: 'Trim / performance badge', pathHint: 'vehicle_config.trim_badging' },
      { id: 'wheel-type', label: 'Wheel package', pathHint: 'vehicle_config.wheel_type' },
      { id: 'exterior-color', label: 'Paint code / name', pathHint: 'vehicle_config.exterior_color' },
      { id: 'roof-color', label: 'Glass / roof', pathHint: 'vehicle_config.roof_color' },
      { id: 'charge-port-type', label: 'Charge port region type', pathHint: 'vehicle_config.charge_port_type' },
      { id: 'eu-vehicle', label: 'EU-specific flag', pathHint: 'vehicle_config.eu_vehicle' },
      { id: 'rear-seat-heaters', label: 'Rear seat heat availability', pathHint: 'vehicle_config.rear_seat_heaters' },
    ],
  },
  {
    id: 'gui-settings',
    title: 'gui_settings',
    description: 'Units & UI preferences tied to profile',
    items: [
      { id: 'gui-distance-units', label: 'Distance units', pathHint: 'gui_settings.gui_distance_units' },
      { id: 'gui-temperature-units', label: 'Temperature units', pathHint: 'gui_settings.gui_temperature_units' },
      { id: 'gui-charge-rate-units', label: 'Charge rate units', pathHint: 'gui_settings.gui_charge_rate_units' },
      { id: 'gui-range-display', label: 'Rated vs ideal display', pathHint: 'gui_settings.gui_range_display' },
      { id: 'gui-24-hour-time', label: '24h clock', pathHint: 'gui_settings.gui_24_hour_time' },
    ],
  },
  {
    id: 'commands-streaming',
    title: 'Commands, Fleet API & telemetry',
    description: 'Server-side capabilities beyond read-only vehicle_data',
    items: [
      { id: 'wake', label: 'Wake vehicle command', pathHint: 'POST wake_up' },
      { id: 'door-lock', label: 'Door lock / unlock', pathHint: 'command/set_locked' },
      { id: 'climate-start', label: 'Remote climate start/stop', pathHint: 'command/auto_conditioning_*' },
      { id: 'charge-port', label: 'Charge port open/close', pathHint: 'command/charge_port_*' },
      { id: 'charging-limit', label: 'Set charge limit', pathHint: 'command/set_charge_limit' },
      { id: 'fleet-auth', label: 'OAuth partner credentials / partner token exchange', pathHint: 'Fleet API auth flow' },
      { id: 'fleet-telemetry', label: 'High-frequency Fleet Telemetry protobuf streams', pathHint: 'Separate from polled vehicle_data' },
      { id: 'trip-energy', label: 'Trip-level energy / efficiency aggregates', pathHint: 'Telemetry or exported drives (product-specific)' },
    ],
  },
]

export const TESLA_CHECKLIST_STORAGE_KEY = 'tesla-fleet-ground-truth-checklist-v1'

export function loadTeslaChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TESLA_CHECKLIST_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveTeslaChecklist(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(TESLA_CHECKLIST_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}
