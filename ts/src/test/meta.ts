import furi from "furi";

export const dirname: string = furi.toSysPath(furi.join(import.meta.url, ".."));

// tslint:disable-next-line:no-default-export
export default {dirname};
