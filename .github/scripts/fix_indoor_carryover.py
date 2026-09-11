from pathlib import Path

CARRYOVER = r'''
		// --- Greenhouse / Ginger Island crop carry-over across years ---
		// Regrowing crops persist automatically. Non-regrowing crops persist only
		// when AutoPlant was selected (legacy saved chains are inferred by cadence).
		(function add_prior_year_indoor_crops(){
			if (!farm.greenhouse) return;
			var cy = farm.year.index;
			if (cy <= 0) return;

			var year_start_global = (cy * YEAR_DAYS) + 1;
			var year_end_global = year_start_global + YEAR_DAYS - 1;
			var regrow_roots = [];
			var auto_groups = {};

			function chain_key(plan, global_plant, grow_time){
				var fert = plan.fertilizer && plan.fertilizer.id || "none";
				var phase = global_plant % grow_time;
				return [plan.location || "greenhouse", plan.crop.id, plan.amount, fert,
					plan.irrigated ? 1 : 0, grow_time, phase].join("|");
			}

			for (var yi = 0; yi < cy; yi++){
				var previous_year = self.years[yi];
				if (!previous_year || !previous_year.data || !previous_year.data.greenhouse) continue;
				$.each(previous_year.data.greenhouse.plans, function(pdate, plans){
					pdate = parseInt(pdate);
					$.each(plans || [], function(i, plan){
						if (!plan || !plan.crop || plan.crop.tree) return;
						var grow_time = plan.get_grow_time();
						if (!grow_time) return;
						var global_plant = (yi * YEAR_DAYS) + pdate;
						if (plan.crop.regrow){
							regrow_roots.push({plan: plan, global_plant: global_plant});
							return;
						}
						var key = chain_key(plan, global_plant, grow_time);
						if (!auto_groups[key]) auto_groups[key] = [];
						auto_groups[key].push({
							plan: plan,
							global_plant: global_plant,
							grow_time: grow_time
						});
					});
				});
			}

			function add_carryover_harvest(plan, global_harvest, replant){
				var local_date = global_harvest - (cy * YEAR_DAYS);
				if (local_date < 1 || local_date > YEAR_DAYS) return;
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

				if (replant){
					var seed_cost = plan.get_cost();
					day_total.profit.min -= seed_cost;
					day_total.profit.max -= seed_cost;
					season_total.profit.min -= seed_cost;
					season_total.profit.max -= seed_cost;
					season_total.plantings += plan.amount;
				}
			}

			// Crops such as Ancient Fruit keep regrowing forever indoors.
			$.each(regrow_roots, function(i, root){
				var interval = root.plan.crop.regrow;
				var next_harvest = root.global_plant + root.plan.get_grow_time();
				if (next_harvest < year_start_global){
					next_harvest += Math.ceil((year_start_global - next_harvest) / interval) * interval;
				}
				for (var h = next_harvest; h <= year_end_global; h += interval){
					add_carryover_harvest(root.plan, h, false);
				}
			});

			// AutoPlant chains such as Starfruit harvest and buy/replant seeds
			// on the same cadence in every later year.
			$.each(auto_groups, function(key, entries){
				entries.sort(function(a, b){ return a.global_plant - b.global_plant; });
				var persisted = false;
				for (var i = 0; i < entries.length; i++){
					if (entries[i].plan.auto_replant){ persisted = true; break; }
				}
				if (!persisted){
					for (var j = 1; j < entries.length; j++){
						if (entries[j].global_plant - entries[j-1].global_plant === entries[j].grow_time){
							persisted = true;
							break;
						}
					}
				}
				if (!persisted) return;

				var root = entries[0];
				var next_cycle = root.global_plant + root.grow_time;
				if (next_cycle < year_start_global){
					next_cycle += Math.ceil((year_start_global - next_cycle) / root.grow_time) * root.grow_time;
				}
				for (var cycle = next_cycle; cycle <= year_end_global; cycle += root.grow_time){
					add_carryover_harvest(root.plan, cycle, true);
				}
			});
		})();
'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()

    if "function add_prior_year_indoor_crops()" not in text:
        anchor = "\n// Add up annual total"
        if anchor not in text:
            raise SystemExit(f"Annual-total anchor missing in {filename}")
        text = text.replace(anchor, "\n" + CARRYOVER + anchor, 1)

    if "self.auto_replant = false;" not in text:
        anchor = '\t\tself.location = "farm";\ninit();'
        replacement = '\t\tself.location = "farm";\n\t\tself.auto_replant = false;\ninit();'
        if anchor not in text:
            raise SystemExit(f"Plan property anchor missing in {filename}")
        text = text.replace(anchor, replacement, 1)

    if "self.auto_replant = !!(data && data.auto_replant);" not in text:
        anchor = "\t\t\tself.location = (data && data.location) ? data.location : (self.greenhouse ? (planner.cmode == 'island' ? 'island' : 'greenhouse') : 'farm');"
        if anchor not in text:
            raise SystemExit(f"Plan load anchor missing in {filename}")
        text = text.replace(anchor, anchor + "\n\t\t\tself.auto_replant = !!(data && data.auto_replant);", 1)

    if "if (this.auto_replant) data.auto_replant = true;" not in text:
        anchor = "    if (this.location) data.location = this.location;\n    return data;"
        if anchor not in text:
            raise SystemExit(f"Plan save anchor missing in {filename}")
        text = text.replace(anchor, "    if (this.location) data.location = this.location;\n    if (this.auto_replant) data.auto_replant = true;\n    return data;", 1)

    if "newplan.auto_replant = !!auto_replant;" not in text:
        anchor = "\t\tnewplan.location = planner.cmode;\n\t\tvar plan = new Plan(newplan.get_data(), planner.in_greenhouse());"
        if anchor not in text:
            raise SystemExit(f"AutoPlant anchor missing in {filename}")
        text = text.replace(anchor, "\t\tnewplan.location = planner.cmode;\n\t\tnewplan.auto_replant = !!auto_replant;\n\t\tvar plan = new Plan(newplan.get_data(), planner.in_greenhouse());", 1)

    path.write_text(text)

index = Path("index.html")
html = index.read_text()
old_src = './scripts/planner.js?v=multiyearfix-20260911'
new_src = './scripts/planner.js?v=indoorcarryover-20260911'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner script URL anchor missing")
    index.write_text(html.replace(old_src, new_src, 1))

for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert "function add_prior_year_indoor_crops()" in text
    assert "newplan.auto_replant = !!auto_replant;" in text
    assert "if (this.auto_replant) data.auto_replant = true;" in text
assert new_src in index.read_text()
print("Indoor crop carry-over patch applied.")
