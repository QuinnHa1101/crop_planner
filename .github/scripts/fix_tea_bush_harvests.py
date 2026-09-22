from pathlib import Path
import json

# Mark Tea Bush as a special persistent plant with fixed harvest windows.
config_path = Path("config.json")
config = json.loads(config_path.read_text())
tea = next(c for c in config["crops"] if c["id"] == "tea_sapling")
tea["tea_bush"] = True
tea["note"] = (
    "Takes 20 days to mature. Produces 1 Tea Leaf daily on days 22–28 "
    "of Spring, Summer, and Fall; also Winter days 22–28 when indoors. "
    "Grows in every season without watering and does not use fertilizer."
)
config["updated_at"] = "2026-09-22"
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")

TEA_CARRYOVER = r'''
		// --- Tea Bush carry-over and fixed harvest windows ---
		// Tea Bushes persist across years. Mature bushes produce only on days
		// 22-28 of Spring/Summer/Fall, plus Winter when indoors.
		(function add_prior_year_tea_harvests(){
			var cy = farm.year.index;
			if (cy <= 0) return;

			function add_tea_harvest(plan, local_date){
				var harvest = new Harvest(plan, local_date, true, cy);
				if (!farm.harvests[local_date]) farm.harvests[local_date] = [];
				farm.harvests[local_date].push(harvest);
				if (!farm.totals.day[local_date]) farm.totals.day[local_date] = new Finance;

				var day_total = farm.totals.day[local_date];
				var season_index = Math.floor((local_date - 1) / SEASON_DAYS);
				var season_total = farm.totals.season[season_index];
				day_total.profit.min += harvest.revenue.min;
				day_total.profit.max += harvest.revenue.max;
				season_total.profit.min += harvest.revenue.min;
				season_total.profit.max += harvest.revenue.max;
				season_total.harvests.min += harvest.yield.min;
				season_total.harvests.max += harvest.yield.max;
			}

			for (var yi = 0; yi < cy; yi++){
				var previous_year = self.years[yi];
				if (!previous_year || !previous_year.data) continue;
				var previous_farm = farm.greenhouse ? previous_year.data.greenhouse : previous_year.data.farm;
				if (!previous_farm || !previous_farm.plans) continue;

				$.each(previous_farm.plans, function(pdate, plans){
					pdate = parseInt(pdate);
					$.each(plans || [], function(i, plan){
						if (!plan || !plan.crop || !plan.crop.tea_bush) return;
						var location = plan.location || (farm.greenhouse ? "greenhouse" : "farm");
						if (farm.greenhouse ? location === "farm" : location !== "farm") return;

						var maturity_global = (yi * YEAR_DAYS) + pdate + plan.get_grow_time();
						var final_season = farm.greenhouse ? 3 : 2;
						for (var season_index = 0; season_index <= final_season; season_index++){
							for (var season_day = 22; season_day <= 28; season_day++){
								var local_date = (season_index * SEASON_DAYS) + season_day;
								var global_date = (cy * YEAR_DAYS) + local_date;
								if (global_date >= maturity_global) add_tea_harvest(plan, local_date);
							}
						}
					});
				});
			}
		})();

'''

old_harvest_block = r'''
				// Initial harvest
				var harvests = [];
				harvests.push(new Harvest(plan, first_harvest, false, farm.year.index));
				
				// Regrowth harvests
				if (crop.regrow){
					var regrowths = Math.floor((crop_end - first_harvest) / crop.regrow);
					for (var i = 1; i <= regrowths; i++){
						var regrow_date = first_harvest + (i * crop.regrow);
						if (regrow_date > crop_end) break;
						harvests.push(new Harvest(plan, regrow_date, true, farm.year.index));
					}
				}
'''
new_harvest_block = r'''
				var harvests = [];
				if (crop.tea_bush){
					// Tea matures after 20 days but only yields during the final week.
					// Outdoors there is no Winter harvest; indoors Winter 22-28 is valid.
					var final_season = farm.greenhouse ? 3 : 2;
					for (var tea_season = 0; tea_season <= final_season; tea_season++){
						for (var tea_day = 22; tea_day <= 28; tea_day++){
							var tea_date = (tea_season * SEASON_DAYS) + tea_day;
							if (tea_date < first_harvest || tea_date > crop_end) continue;
							harvests.push(new Harvest(plan, tea_date, tea_date > first_harvest, farm.year.index));
						}
					}
				} else {
					// Initial harvest
					harvests.push(new Harvest(plan, first_harvest, false, farm.year.index));

					// Regrowth harvests
					if (crop.regrow){
						var regrowths = Math.floor((crop_end - first_harvest) / crop.regrow);
						for (var i = 1; i <= regrowths; i++){
							var regrow_date = first_harvest + (i * crop.regrow);
							if (regrow_date > crop_end) break;
							harvests.push(new Harvest(plan, regrow_date, true, farm.year.index));
						}
					}
				}
'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()

    if "self.tea_bush = false;" not in text:
        anchor = "\t\tself.wild = false;"
        if anchor not in text:
            raise SystemExit(f"Crop defaults anchor missing in {filename}")
        text = text.replace(anchor, anchor + "\n\t\tself.tea_bush = false;", 1)

    if "self.tea_bush = !!data.tea_bush;" not in text:
        anchor = "\t\t\tif (data.no_suggest) self.no_suggest = true;"
        if anchor not in text:
            raise SystemExit(f"Crop load anchor missing in {filename}")
        text = text.replace(anchor, anchor + "\n\t\t\tself.tea_bush = !!data.tea_bush;", 1)

    if old_harvest_block in text:
        text = text.replace(old_harvest_block, new_harvest_block, 1)
    elif "if (crop.tea_bush){" not in text:
        raise SystemExit(f"Harvest schedule anchor missing in {filename}")

    if "add_prior_year_tea_harvests" not in text:
        marker = "\t\t// --- Greenhouse / Ginger Island crop carry-over across years ---"
        if marker not in text:
            raise SystemExit(f"Carry-over insertion anchor missing in {filename}")
        text = text.replace(marker, TEA_CARRYOVER + marker, 1)

    # Dedicated Tea carry-over handles its fixed windows; exclude it from the
    # generic indoor crop loop that would otherwise harvest every day.
    old_regrow = '''\t\t\t\t\t\tif (plan.crop.regrow){
\t\t\t\t\t\t\tregrow_roots.push({plan: plan, global_plant: global_plant});'''
    new_regrow = '''\t\t\t\t\t\tif (plan.crop.regrow){
\t\t\t\t\t\t\tif (plan.crop.tea_bush) return;
\t\t\t\t\t\t\tregrow_roots.push({plan: plan, global_plant: global_plant});'''
    if old_regrow in text:
        text = text.replace(old_regrow, new_regrow, 1)
    elif "if (plan.crop.tea_bush) return;" not in text:
        raise SystemExit(f"Indoor Tea exclusion anchor missing in {filename}")

    # Tea Bushes grow like fruit trees: no speed fertilizer or Agriculturist.
    text = text.replace(
        "if (this.crop && this.crop.tree){",
        "if (this.crop && (this.crop.tree || this.crop.tea_bush)){",
        1,
    )
    text = text.replace(
        "if (crop && crop.tree){",
        "if (crop && (crop.tree || crop.tea_bush)){",
        1,
    )
    text = text.replace(
        "if (crop.tree){\n\t\t\tnewplan.irrigated = false;",
        "if (crop.tree || crop.tea_bush){\n\t\t\tnewplan.irrigated = false;",
        1,
    )

    path.write_text(text)

index_path = Path("index.html")
html = index_path.read_text()
html = html.replace(
    "self.crops[self.newplan.crop_id].tree\"\n\t\t\t\t\t\ttitle=\"{{(self.crops[self.newplan.crop_id] && self.crops[self.newplan.crop_id].tree) ? 'Fruit trees cannot use fertilizer' : ''}}\"",
    "(self.crops[self.newplan.crop_id].tree || self.crops[self.newplan.crop_id].tea_bush)\"\n\t\t\t\t\t\ttitle=\"{{(self.crops[self.newplan.crop_id] && (self.crops[self.newplan.crop_id].tree || self.crops[self.newplan.crop_id].tea_bush)) ? 'Fruit trees and Tea Bushes cannot use fertilizer' : ''}}\"",
    1,
)
old_src = './scripts/planner.js?v=elliottavatar-20260918'
new_src = './scripts/planner.js?v=teabush-20260922'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner cache key anchor missing")
    html = html.replace(old_src, new_src, 1)
index_path.write_text(html)

# Regression checks.
config = json.loads(config_path.read_text())
tea = next(c for c in config["crops"] if c["id"] == "tea_sapling")
assert tea["tea_bush"] is True
assert "days 22–28" in tea["note"]
for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert "add_prior_year_tea_harvests" in text
    assert "if (crop.tea_bush){" in text
    assert "if (plan.crop.tea_bush) return;" in text
    assert "this.crop.tree || this.crop.tea_bush" in text
assert new_src in index_path.read_text()
print("Tea Bush harvest windows corrected for current and later years.")
