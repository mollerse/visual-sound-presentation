import midiControl from "@mollerse/midi-control";
import { enableExternalControlOfLEDs } from "@mollerse/midi-control/devices/nanokontrol.js";

/** @import {MidiControl} from '@mollerse/midi-control' */

/** @type {MidiControl} */
export let controls;

export async function init() {
  if (controls) return;

  controls = await midiControl({
    deviceName: "nanoKONTROL2",
    title: "Visual Sound",
  });

  enableExternalControlOfLEDs(controls);
}
