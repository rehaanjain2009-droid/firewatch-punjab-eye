import { describe, expect, it } from "vitest";
import { incidentKey, matchOfficers, type OfficerDirectoryRow } from "./officerMatch";

const row = (village: string, lat: number | null, lng: number | null): OfficerDirectoryRow => ({
  village,
  block: "Jagraon",
  tehsil: "Jagraon",
  thana: "City Jagraon",
  lat,
  lng,
  patwari_name: `Patwari ${village}`,
  patwari_contact: "98000-00001",
  sho_name: `SHO ${village}`,
  sho_contact: "98000-00002",
  nodal_officer_name: `Nodal ${village}`,
  nodal_officer_designation: "Panchayat Secretary",
  nodal_officer_contact: "98000-00003",
});

const directory = [row("Akhara", 30.80, 75.45), row("Dangian", 30.736, 75.385), row("Unlocated", null, null)];

describe("officer assignment", () => {
  it("assigns the Patwari, SHO and Nodal Officer of the nearest village", () => {
    const a = matchOfficers(30.801, 75.451, directory)!;
    expect(a.village).toBe("Akhara");
    expect(a.officers.map((o) => o.role)).toEqual(["Patwari", "SHO", "Nodal Officer"]);
    expect(a.officers[0].contact).toBe("98000-00001");
    expect(a.approximate).toBe(false);
  });

  it("flags a match farther than 5 km as approximate", () => {
    const a = matchOfficers(30.95, 75.45, directory)!;
    expect(a.approximate).toBe(true);
  });

  it("ignores villages without coordinates", () => {
    expect(matchOfficers(30.8, 75.45, [row("Unlocated", null, null)])).toBeNull();
  });
});

describe("incident key", () => {
  it("is identical for the same detection", () => {
    const f = { lat: 30.812345, lng: 75.456789, acqDate: "2026-10-31", acqTime: "805", satellite: "VIIRS_SNPP_NRT" };
    expect(incidentKey(f)).toBe("30.8123_75.4568_2026-10-31_0805_VIIRS_SNPP_NRT");
  });
});
