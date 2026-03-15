import { describe, expect, it } from "vitest";
import {
  buildApprovedCultivationSectMap,
  evaluateCultivationApplication,
  getCurrentFormalSectKey,
} from "@/lib/cultivation";

describe("cultivation helpers", () => {
  it("returns latest approved sect as current formal sect", () => {
    const currentFormalSectKey = getCurrentFormalSectKey([
      {
        aid: "agent-1",
        status: "submitted",
        target_sect_key: "content_ops",
      } as any,
      {
        aid: "agent-1",
        status: "approved",
        target_sect_key: "automation_ops",
      } as any,
      {
        aid: "agent-1",
        status: "approved",
        target_sect_key: "research_ops",
      } as any,
    ]);

    expect(currentFormalSectKey).toBe("automation_ops");
  });

  it("builds approved formal sect map by aid", () => {
    const approvedSectByAid = buildApprovedCultivationSectMap([
      {
        aid: "agent-1",
        status: "approved",
        target_sect_key: "automation_ops",
      } as any,
      {
        aid: "agent-1",
        status: "approved",
        target_sect_key: "research_ops",
      } as any,
      {
        aid: "agent-2",
        status: "submitted",
        target_sect_key: "content_ops",
      } as any,
      {
        aid: "agent-3",
        status: "approved",
        target_sect_key: "service_ops",
      } as any,
    ]);

    expect(approvedSectByAid.get("agent-1")).toBe("automation_ops");
    expect(approvedSectByAid.get("agent-2")).toBeUndefined();
    expect(approvedSectByAid.get("agent-3")).toBe("service_ops");
  });

  it("treats a route change from current formal sect as transfer", () => {
    const result = evaluateCultivationApplication({
      targetSectKey: "content_ops",
      currentFormalSectKey: "automation_ops",
      growthProfile: {
        current_maturity_pool: "standard",
        primary_domain: "content",
      } as any,
      dojoOverview: {
        school_key: "content_ops",
        stage: "practice",
      } as any,
      profileBasicsReady: true,
      completedTaskCount: 1,
      reusableAssetCount: 1,
    });

    expect(result.mode).toBe("transfer");
    expect(result.status).toBe("ready");
    expect(result.targetSectKey).toBe("content_ops");
    expect(result.recommendedSectKey).toBe("content_ops");
  });

  it("keeps first formal application as application even after dojo recommendation", () => {
    const result = evaluateCultivationApplication({
      targetSectKey: "content_ops",
      growthProfile: {
        current_maturity_pool: "standard",
        primary_domain: "content",
      } as any,
      dojoOverview: {
        school_key: "content_ops",
        stage: "practice",
      } as any,
      profileBasicsReady: true,
      completedTaskCount: 1,
      reusableAssetCount: 1,
    });

    expect(result.mode).toBe("application");
    expect(result.status).toBe("ready");
  });
});
