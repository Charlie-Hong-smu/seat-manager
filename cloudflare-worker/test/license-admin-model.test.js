import assert from "node:assert/strict";
import test from "node:test";

import {
  channelDistribution,
  dashboardMetrics,
  expiryDistribution,
  filterAndSortLicenses,
  paginate,
  upcomingExpiries,
} from "../../license-admin/admin-model.js";

const now = new Date("2026-07-13T00:00:00.000Z");
const licenses = [
  {
    licenseId: "xhs-new",
    productCode: "SM-SEARCHME",
    acquisitionChannel: "xiaohongshu",
    acquisitionDetail: "笔记 909",
    status: "active",
    expiresAt: "2026-07-20T00:00:00.000Z",
    aiEnabled: true,
    aiExpiresAt: "2026-08-01T00:00:00.000Z",
    deviceCount: 2,
    maxDevices: 3,
    allowedEditions: ["commercial"],
    createdAt: "2026-07-10T00:00:00.000Z",
  },
  {
    licenseId: "wechat-expired",
    acquisitionChannel: "wechat",
    acquisitionDetail: "社群",
    status: "active",
    expiresAt: "2026-07-01T00:00:00.000Z",
    aiEnabled: false,
    deviceCount: 0,
    maxDevices: 3,
    allowedEditions: ["zhang"],
    createdAt: "",
  },
  {
    licenseId: "offline-disabled",
    acquisitionChannel: "offline",
    status: "disabled",
    expiresAt: "",
    aiEnabled: true,
    deviceCount: 3,
    maxDevices: 3,
    allowedEditions: ["commercial"],
    createdAt: "2026-07-11T00:00:00.000Z",
  },
];

test("dashboard metrics use effective expiry and AI validity", () => {
  assert.deepEqual(dashboardMetrics(licenses, now), {
    total: 3,
    usable: 1,
    expiring: 1,
    aiValid: 1,
    devices: 5,
    deviceCapacity: 9,
  });
});

test("search and combined filters cover code, channel, edition and devices", () => {
  assert.equal(filterAndSortLicenses(licenses, { query: "searchme" }, now)[0].licenseId, "xhs-new");
  assert.equal(filterAndSortLicenses(licenses, { query: "笔记", channel: "xiaohongshu", edition: "commercial", devices: "used" }, now).length, 1);
  assert.equal(filterAndSortLicenses(licenses, { status: "expired" }, now)[0].licenseId, "wechat-expired");
  assert.equal(filterAndSortLicenses(licenses, { devices: "full" }, now)[0].licenseId, "offline-disabled");
});

test("distributions and pagination keep deterministic counts", () => {
  assert.deepEqual(channelDistribution(licenses).map(({ value, count }) => [value, count]), [
    ["xiaohongshu", 1], ["wechat", 1], ["offline", 1],
  ]);
  assert.deepEqual(expiryDistribution(licenses, now).map(({ value, count }) => [value, count]), [
    ["expired", 1], ["within7", 1], ["disabled", 1],
  ]);
  assert.deepEqual(paginate([1, 2, 3], 2, 2), { items: [3], page: 2, totalPages: 2 });
  assert.deepEqual(paginate([], 3, 25), { items: [], page: 1, totalPages: 1 });
  assert.deepEqual(upcomingExpiries(licenses, now), [{
    licenseId: "xhs-new",
    expiresAt: "2026-07-20T00:00:00.000Z",
    daysRemaining: 7,
  }]);
});
