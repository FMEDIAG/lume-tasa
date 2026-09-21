import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCoinPriceGuards,
  coinIdFromText,
  collectorFloorEur,
  extractGoldChips,
  inferGoldForm,
  isInvestmentGold,
  isModernBullion,
  isPlatedGold,
  isSolidGold,
  looksLikeCoinText,
  meltValue,
  numismaticMeltMultiplier,
  typicalFineWeightG,
  type CoinId,
  type MetalSpots,
} from "./coin-floors.ts";

const spots: MetalSpots = {
  goldUsd: 3800,
  silverUsd: 45,
  eurPerUsd: 0.86,
  goldEur: 3800 * 0.86,
  silverEur: 45 * 0.86,
};

function coin(partial: Partial<CoinId> & Pick<CoinId, "title">): CoinId {
  return {
    country: "Spain",
    denomination: "",
    year: "1795",
    mint: "Madrid",
    seriesName: "",
    metal: "gold",
    estimatedFineWeightG: null,
    certifier: "none",
    grade: null,
    certNumber: null,
    isLikelyReproduction: false,
    marketType: "numismatic",
    identification: partial.title,
    searchQuery: partial.title,
    confidence: "high",
    ...partial,
  };
}

const meltQuote = {
  priceEurMin: 2500,
  priceEurMax: 2800,
  priceUsdMin: 2900,
  priceUsdMax: 3300,
  notes: "Valor de fundición.",
};

describe("coin floors — 8 escudos / onza", () => {
  it("knows the fine gold weight", () => {
    const id = coin({ title: "8 escudos Carlos IV 1795 Madrid", denomination: "8 escudos" });
    assert.equal(typicalFineWeightG(id), 23.68);
  });

  it("does not treat colonial gold as bullion", () => {
    const id = coin({ title: "8 escudos onza 1795", denomination: "8 escudos", marketType: "unknown" });
    assert.equal(isModernBullion(id), false);
    assert.equal(isInvestmentGold(id), false);
  });

  it("lifts a melt quote by ~€10k for an ungraded onza", () => {
    const id = coin({ title: "España 8 escudos 1795 onza", denomination: "8 escudos" });
    const guarded = applyCoinPriceGuards(meltQuote, id, spots);
    // Melt ≈ €2.5k; XF floor 9500 and ~4.2× melt (~€11k) — must not stay at 2500.
    assert.ok(guarded.priceEurMin >= 9000, `min ${guarded.priceEurMin}`);
    assert.ok(guarded.priceEurMax >= guarded.priceEurMin);
    const lift = guarded.priceEurMin - meltQuote.priceEurMin;
    assert.ok(lift >= 6500, `only lifted ${lift} €`);
  });

  it("uses a higher floor for NGC MS-63", () => {
    const id = coin({
      title: "8 escudos 1795",
      denomination: "8 escudos",
      certifier: "NGC",
      grade: "MS-63",
    });
    assert.ok((collectorFloorEur(id) ?? 0) >= 18000);
    const guarded = applyCoinPriceGuards(meltQuote, id, spots);
    assert.ok(guarded.priceEurMin >= 18000, `min ${guarded.priceEurMin}`);
  });

  it("annotates melt vs premium so the card can show chips", () => {
    const id = coin({ title: "8 escudos 1795 onza", denomination: "8 escudos", goldForm: "solid" });
    const guarded = applyCoinPriceGuards(meltQuote, id, spots);
    const chips = extractGoldChips(guarded.notes);
    assert.ok(chips.includes("Oro macizo"), chips.join(","));
    assert.ok(chips.some((c) => c.startsWith("Fundición")), chips.join(","));
    assert.ok(chips.some((c) => c.startsWith("Prima")), chips.join(","));
  });
});

describe("1 escudo colonial", () => {
  it("knows the fine gold weight and is not investment gold", () => {
    const id = coin({ title: "1 escudo Carlos III 1786 Madrid", denomination: "1 escudo" });
    assert.equal(typicalFineWeightG(id), 2.96);
    assert.equal(isInvestmentGold(id), false);
    assert.ok((collectorFloorEur(id) ?? 0) >= 750);
  });

  it("does not confuse 10 escudos with 1 escudo", () => {
    const ten = coin({ title: "10 escudos Isabel II 1868", denomination: "10 escudos" });
    assert.equal(typicalFineWeightG(ten), 7.56);
    assert.ok((collectorFloorEur(ten) ?? 0) >= 2800);
  });

  it("lifts a melt-style quote well above the ~€300 melt", () => {
    const id = coin({ title: "España 1 escudo 1786", denomination: "1 escudo", goldForm: "solid" });
    const low = {
      priceEurMin: 300,
      priceEurMax: 340,
      priceUsdMin: 350,
      priceUsdMax: 400,
      notes: "Valor de fundición.",
    };
    const guarded = applyCoinPriceGuards(low, id, spots);
    assert.ok(guarded.priceEurMin >= 700, `min ${guarded.priceEurMin}`);
    assert.ok(numismaticMeltMultiplier(id) >= 2.2);
  });
});

describe("bullion is not inflated", () => {
  it("leaves a Krugerrand near melt", () => {
    const id = coin({
      title: "Krugerrand 1 oz 1975",
      denomination: "1 oz",
      country: "South Africa",
      marketType: "bullion",
      estimatedFineWeightG: 31.1,
    });
    assert.equal(isModernBullion(id), true);
    assert.equal(collectorFloorEur(id), null);
    const melt = meltValue(id, spots)!;
    const guarded = applyCoinPriceGuards(
      {
        priceEurMin: Math.round(melt.eur),
        priceEurMax: Math.round(melt.eur * 1.05),
        priceUsdMin: Math.round(melt.usd),
        priceUsdMax: Math.round(melt.usd * 1.05),
        notes: "spot",
      },
      id,
      spots,
    );
    assert.ok(guarded.priceEurMin < melt.eur * 1.1);
  });
});

describe("investment gold stays near melt", () => {
  it("keeps a sovereign close to melt", () => {
    const id = coin({
      title: "Sovereign Victoria 1900 London",
      denomination: "sovereign",
      country: "United Kingdom",
      marketType: "unknown",
      goldForm: "solid",
    });
    assert.equal(typicalFineWeightG(id), 7.322);
    assert.equal(isInvestmentGold(id), true);
    assert.equal(collectorFloorEur(id), null);
    const melt = meltValue(id, spots)!;
    const guarded = applyCoinPriceGuards(
      {
        priceEurMin: Math.round(melt.eur),
        priceEurMax: Math.round(melt.eur * 1.05),
        priceUsdMin: Math.round(melt.usd),
        priceUsdMax: Math.round(melt.usd * 1.05),
        notes: "spot",
      },
      id,
      spots,
    );
    assert.ok(guarded.priceEurMin < melt.eur * 1.15, `min ${guarded.priceEurMin} melt ${melt.eur}`);
    assert.ok(guarded.priceEurMin >= melt.eur * 0.99);
  });

  it("keeps a common $20 Saint-Gaudens close to melt", () => {
    const id = coin({
      title: "Saint-Gaudens Double Eagle $20 1927",
      denomination: "$20",
      country: "United States",
      marketType: "unknown",
      goldForm: "solid",
    });
    assert.equal(typicalFineWeightG(id), 30.09);
    assert.equal(isInvestmentGold(id), true);
    assert.equal(collectorFloorEur(id), null);
    const melt = meltValue(id, spots)!;
    const guarded = applyCoinPriceGuards(
      {
        priceEurMin: Math.round(melt.eur),
        priceEurMax: Math.round(melt.eur * 1.04),
        priceUsdMin: Math.round(melt.usd),
        priceUsdMax: Math.round(melt.usd * 1.04),
        notes: "spot",
      },
      id,
      spots,
    );
    assert.ok(guarded.priceEurMin < melt.eur * 1.2, `min ${guarded.priceEurMin} melt ${melt.eur}`);
  });

  it("treats a 20 franc Napoléon as investment gold", () => {
    const id = coin({
      title: "20 francs Napoléon III 1865",
      denomination: "20 francs",
      country: "France",
      goldForm: "solid",
      marketType: "unknown",
    });
    assert.equal(typicalFineWeightG(id), 5.806);
    assert.equal(isInvestmentGold(id), true);
  });
});

describe("plated vs solid", () => {
  it("crushes a plated souvenir 8 escudos instead of applying melt", () => {
    const id = coin({
      title: "8 escudos souvenir gold plated",
      denomination: "8 escudos",
      goldForm: "plated",
      isLikelyReproduction: true,
    });
    assert.equal(isPlatedGold(id), true);
    assert.equal(isSolidGold(id), false);
    assert.equal(collectorFloorEur(id), null);
    assert.equal(meltValue(id, spots), null);
    const guarded = applyCoinPriceGuards(
      {
        priceEurMin: 9800,
        priceEurMax: 12000,
        priceUsdMin: 11400,
        priceUsdMax: 14000,
        notes: "Parece onza de oro.",
      },
      id,
      spots,
    );
    assert.ok(guarded.priceEurMin <= 20, `min ${guarded.priceEurMin}`);
    assert.ok(guarded.priceEurMax <= 80);
    const chips = extractGoldChips(guarded.notes);
    assert.ok(chips.includes("Baño de oro"), chips.join(","));
  });

  it("infers plated from souvenir wording even if goldForm is unknown", () => {
    const id = coin({
      title: "8 escudos replica souvenir",
      denomination: "8 escudos",
      goldForm: "unknown",
      metal: "unknown",
    });
    assert.equal(inferGoldForm(id), "plated");
  });

  it("does not treat a genuine piece as plated just because notes mention replicas", () => {
    const id = coin({
      title: "8 escudos Carlos IV 1795",
      denomination: "8 escudos",
      goldForm: "unknown",
      metal: "gold",
      identification: "Onza de oro macizo. Circulan imitaciones modernas.",
    });
    assert.equal(inferGoldForm(id), "solid");
    assert.equal(isPlatedGold(id), false);
  });

  it("infers solid for a genuine sovereign with unknown goldForm", () => {
    const id = coin({
      title: "Sovereign Edward VII 1910",
      denomination: "sovereign",
      goldForm: "unknown",
      metal: "gold",
    });
    assert.equal(inferGoldForm(id), "solid");
    assert.equal(isSolidGold(id), true);
  });
});

describe("100 pesetas", () => {
  it("does not quote melt for Alfonso XII 100 pesetas", () => {
    const id = coin({
      title: "100 pesetas Alfonso XII 1877 DEM",
      denomination: "100 pesetas",
      year: "1877",
    });
    const guarded = applyCoinPriceGuards(meltQuote, id, spots);
    assert.ok(guarded.priceEurMin >= 3500);
    assert.ok(numismaticMeltMultiplier(id) >= 1.6);
    assert.equal(isInvestmentGold(id), false);
  });
});

describe("reproductions and low confidence", () => {
  it("does not apply collector floors", () => {
    const fake = coin({
      title: "8 escudos",
      denomination: "8 escudos",
      isLikelyReproduction: true,
    });
    assert.equal(collectorFloorEur(fake), null);
    const low = coin({ title: "8 escudos", denomination: "8 escudos", confidence: "low" });
    assert.equal(collectorFloorEur(low), null);
  });

  it("still floors a solid-gold cast copy at melt, never collector", () => {
    const id = coin({
      title: "8 escudos copia fundida",
      denomination: "8 escudos",
      goldForm: "solid",
      isLikelyReproduction: true,
      confidence: "low",
    });
    assert.equal(isSolidGold(id), true);
    assert.equal(collectorFloorEur(id), null);
    const melt = meltValue(id, spots)!;
    assert.ok(melt.eur > 2000, `melt ${melt.eur}`);
    const guarded = applyCoinPriceGuards(
      {
        priceEurMin: 180,
        priceEurMax: 250,
        priceUsdMin: 210,
        priceUsdMax: 290,
        notes: "Copia.",
      },
      id,
      spots,
    );
    assert.ok(guarded.priceEurMin >= melt.eur * 0.99, `min ${guarded.priceEurMin} melt ${melt.eur}`);
    assert.ok(guarded.priceEurMin < 4000, `should not get collector floor, got ${guarded.priceEurMin}`);
  });
});

describe("10 pesetas Alfonso XII", () => {
  it("has a collector floor and is not investment gold", () => {
    const id = coin({
      title: "10 pesetas Alfonso XII 1878 DEM",
      denomination: "10 pesetas",
      year: "1878",
    });
    assert.equal(typicalFineWeightG(id), 2.9);
    assert.equal(isInvestmentGold(id), false);
    assert.ok((collectorFloorEur(id) ?? 0) >= 550);
    const low = {
      priceEurMin: 280,
      priceEurMax: 320,
      priceUsdMin: 325,
      priceUsdMax: 370,
      notes: "Valor de fundición.",
    };
    const guarded = applyCoinPriceGuards(low, id, spots);
    assert.ok(guarded.priceEurMin >= 550, `min ${guarded.priceEurMin}`);
  });
});

describe("Portuguese peça / 4000 réis", () => {
  it("knows the fine weight and treats it as investment gold", () => {
    const peca = coin({
      title: "Peça de 4.000 réis João VI 1822",
      denomination: "4000 réis",
      country: "Portugal",
      goldForm: "solid",
      marketType: "unknown",
    });
    assert.equal(typicalFineWeightG(peca), 7.32);
    assert.equal(isInvestmentGold(peca), true);
    assert.equal(collectorFloorEur(peca), null);

    const two = coin({
      title: "6.400 réis",
      denomination: "6400 réis",
      country: "Portugal",
      goldForm: "solid",
      marketType: "unknown",
    });
    assert.equal(typicalFineWeightG(two), 14.34);
    assert.equal(isInvestmentGold(two), true);
  });
});

describe("generic-path recovery", () => {
  it("coinIdFromText lifts a melt quote for an 8 escudos", () => {
    const id = coinIdFromText("España 8 escudos 1795 onza");
    assert.equal(isSolidGold(id), true);
    const guarded = applyCoinPriceGuards(meltQuote, id, spots);
    assert.ok(guarded.priceEurMin >= 9000, `min ${guarded.priceEurMin}`);
  });

  it("looksLikeCoinText catches gold coins mislabelled as jewelry", () => {
    assert.equal(looksLikeCoinText("jewelry onza de oro"), true);
    assert.equal(looksLikeCoinText("anillo de diamantes"), false);
  });
});
