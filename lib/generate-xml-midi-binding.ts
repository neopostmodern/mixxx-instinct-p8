import * as fs from "fs/promises";
import * as xml2js from "xml2js";

const SCRIPT_LIB_FILENAMES = [
  __dirname + "/../util.js",
  __dirname + "/../deckControl.js",
];

const STATUS_BUTTON_DOWN = 0x96;
const STATUS_BUTTON_UP = 0x86;
const STATUS_ENCODER_CHANGE = 0xb6;

const COLOR_BUTTON_BLUE = 0x01;

const DESCRIPTION_AUTO_GENERATED = "[auto-generated]";

const getStatusesFromName = (name: string): Array<number> => {
  if (name.includes("_button_down")) {
    return [STATUS_BUTTON_DOWN];
  }
  if (name.includes("_button_both")) {
    return [STATUS_BUTTON_DOWN, STATUS_BUTTON_UP];
  }
  if (name.includes("_encoder")) {
    return [STATUS_ENCODER_CHANGE];
  }
  throw Error("Can't deduct statuses from name: " + name);
};

const formatHex = (value: number): string =>
  `0x${value.toString(16).toUpperCase()}`;

const getScript = async (filePath: string): Promise<string> =>
  (await fs.readFile(filePath)).toString();

interface MidiBinding {
  midiControl: number;
  status: number;
  group?: string;
  key: string;
  options?: {};
}
const getMidiControlsFromDecoration = (decoration: string): Array<number> => {
  if (decoration.includes(",")) {
    return decoration.split(",").map(getMidiControlsFromDecoration).flat();
  }
  if (decoration.includes("-")) {
    const midiControls: Array<number> = [];
    const [lower, upper] = decoration.split("-");
    for (
      let midiControl = parseInt(lower, 16);
      midiControl <= parseInt(upper, 16);
      midiControl++
    ) {
      midiControls.push(midiControl);
    }
    return midiControls;
  }
  return [parseInt(decoration, 16)];
};
const getScriptBindingsFromScriptLines = (
  scriptLines: Array<string>
): Array<MidiBinding> => {
  const midiBindings: Array<MidiBinding> = [];

  let decoration: string | null = null;
  let setup;
  for (const line of scriptLines) {
    if (line.startsWith("/* setup")) {
      setup = JSON.parse(line.replace("/* setup", "").replace(" */", ""));
    } else if (line.startsWith("/* midi")) {
      decoration = line.replace("/* midi", "").replace(" */", "");
    } else if (decoration) {
      const expression = line.split(" = ")[0];
      if (!expression.startsWith(setup.prefix)) {
        console.log("wrong prefix", expression);
      }
      getMidiControlsFromDecoration(decoration).forEach((midiControl) => {
        const functionName = expression.replace(setup.prefix + ".", "");
        getStatusesFromName(functionName).forEach((status) => {
          midiBindings.push({
            midiControl,
            key: expression,
            status,
            options: {
              "script-binding": undefined,
            },
          });
        });
      });
      decoration = null;
    }
  }
  return midiBindings;
};
const getMidiBindingsFromScript = async (
  script: string
): Promise<Array<MidiBinding>> => {
  const scriptLibs = await Promise.all(
    SCRIPT_LIB_FILENAMES.map((scriptLibFilename) =>
      getScript(scriptLibFilename)
    )
  );

  let midiMappings;
  try {
    midiMappings = eval(`
const script = {};
const engine = { makeConnection: () => ({ trigger: () => {} }) }; 
${scriptLibs.join("\n")}
${script} 
typeof MIDI_MAPPINGS !== 'undefined' && MIDI_MAPPINGS()
`);
  } catch (e) {
    console.error("Mapping eval failed!");
    console.dir(e);
    throw Error("Eval-Error");
  }
  // console.log(midiMappings)
  return Object.entries<{
    description: string;
    group: string;
    key: string;
    type: string;
  }>(midiMappings).map(([midiControl, { description, group, key, type }]) => ({
    midiControl: parseInt(midiControl), // not hex!
    description,
    group,
    key,
    type,
    status: STATUS_BUTTON_DOWN,
  }));
};

const generateMappingXml = async (controllerScriptName: string) => {
  const xmlFilename = `${__dirname}/../${controllerScriptName}.midi.xml`;

  const script = await getScript(`${__dirname}/../${controllerScriptName}.js`);
  const scriptLines = script.split("\n");
  const midiBindings = await getMidiBindingsFromScript(script);
  //   console.log(scriptLines);
  const scriptBindings = getScriptBindingsFromScriptLines(scriptLines);

  const mapping = await xml2js.parseStringPromise(
    await fs.readFile(xmlFilename)
  );
  const manuallyMappedControls =
    mapping.MixxxControllerPreset.controller[0].controls[0].control.filter(
      ({ description }) => description[0] !== DESCRIPTION_AUTO_GENERATED
    );
  const manuallyMappedOutputs = mapping.MixxxControllerPreset.controller[0]
    .outputs[0]
    ? mapping.MixxxControllerPreset.controller[0].outputs[0].output.filter(
        ({ description }) => description[0] !== DESCRIPTION_AUTO_GENERATED
      )
    : [];
  // console.log(manuallyMappedControls);
  const newMapping = {
    ...mapping,
    MixxxControllerPreset: {
      ...mapping.MixxxControllerPreset,
      info: {
        ...mapping.MixxxControllerPreset.info[0],
        description: `Generated on ${new Date().toISOString()}`,
      },
      controller: {
        ...mapping.MixxxControllerPreset.controller[0],
        controls: {
          control: [
            ...manuallyMappedControls,
            ...[...scriptBindings, ...midiBindings].map(
              ({ midiControl, key, group, status, options }) => ({
                midino: formatHex(midiControl),
                status: formatHex(status),
                key,
                group,
                description: DESCRIPTION_AUTO_GENERATED,
                options,
              })
            ),
          ],
        },
        outputs: {
          output: [
            ...manuallyMappedOutputs,
            ...midiBindings.map(
              ({ midiControl, key, group, status, options }) => ({
                midino: formatHex(midiControl),
                key,
                group,
                description: DESCRIPTION_AUTO_GENERATED,
                on: formatHex(COLOR_BUTTON_BLUE),
                minimum: 0.5,
                status: formatHex(0x96),
              })
            ),
          ],
        },
      },
    },
  };
  const newXml = new xml2js.Builder().buildObject(newMapping);
  // console.log(newXml);
  await fs.writeFile(xmlFilename, newXml);
};

const firstArg = process.argv[process.argv.length - 1];
if (firstArg === __filename) {
  console.error(
    "Pass file base name (without .midi.xml / .js and without a path) as only argument"
  );
  process.exit(1);
}
console.log(`Processing '${firstArg}'...`);
generateMappingXml(firstArg).catch((error) => {
  console.error("Failed to generate mapping XML", error);
});
