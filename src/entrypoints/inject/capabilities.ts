type AddonCapabilityVersion = `${number}.${number}.${number}`;

type AddonCapabilityManifest = {
  [capability: string]: AddonCapabilityVersion | AddonCapabilityManifest;
};

export const AddonCapabilities = {
  addonCapabilities: "1.6.1",
  cookiesPatch: {
    writeDelete: "1.5.2",
  },
  misc: {
    userAgent: "1.6.0",
    viewportWidth: "1.6.0",
  },
} as const satisfies AddonCapabilityManifest;
