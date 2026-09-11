from pathlib import Path

METHODS = r'''
	Plan.prototype.get_paid_seed_count = function(replant){
		var amount = Math.max(0, parseInt(this.amount || 0));
		var use_replant = !!replant || !!this.is_auto_replant_cycle;
		var separate_replant = use_replant && this.replant_same_source === false;
		var source = separate_replant ? this.replant_seed_source : this.seed_source;
		var custom_count = separate_replant ? this.replant_paid_seed_count : this.paid_seed_count;

		source = source || "buy_all";
		if (source == "existing_free") return 0;
		if (source == "buy_all") return amount;

		custom_count = parseInt(custom_count || 0);
		return Math.max(0, Math.min(amount, custom_count));
	};

	Plan.prototype.get_seed_source_label = function(replant){
		var use_replant = !!replant || !!this.is_auto_replant_cycle;
		var separate_replant = use_replant && this.replant_same_source === false;
		var source = separate_replant ? this.replant_seed_source : this.seed_source;
		if (source == "existing_free") return "Existing/free";
		if (source == "mixed") return "Mixed";
		return "Buy all";
	};

'''

SEED_UI = r'''
							<div class="col-md-12 col-xs-12 seed-source-options" style="margin-top:12px;">
								<div class="row">
									<div class="col-md-4 col-xs-12">
										<b>Seed source</b><br>
										<select class="form-control" ng-model="self.newplan.seed_source">
											<option value="buy_all">Buy all</option>
											<option value="existing_free">Existing / free</option>
											<option value="mixed">Mixed</option>
										</select>
									</div>
									<div class="col-md-4 col-xs-12" ng-show="self.newplan.seed_source == 'mixed'">
										<b>Purchased quantity</b><br>
										<input class="form-control" type="number" min="0" max="{{self.newplan.amount}}" ng-model="self.newplan.paid_seed_count">
									</div>
									<div class="col-md-4 col-xs-12">
										<b>Initial seed cost</b><br>
										<div class="form-control" style="background:#f7f7f7;">{{self.newplan.get_paid_seed_count()}} seed(s) · {{self.newplan.get_cost(1)}}g</div>
									</div>
								</div>
								<label style="margin-top:10px;">
									<input type="checkbox" ng-model="self.newplan.replant_same_source"> Use the same seed source for AutoPlant replants
								</label>
								<div class="row" ng-show="!self.newplan.replant_same_source">
									<div class="col-md-4 col-xs-12">
										<b>Replant seed source</b><br>
										<select class="form-control" ng-model="self.newplan.replant_seed_source">
											<option value="buy_all">Buy all</option>
											<option value="existing_free">Existing / free</option>
											<option value="mixed">Mixed</option>
										</select>
									</div>
									<div class="col-md-4 col-xs-12" ng-show="self.newplan.replant_seed_source == 'mixed'">
										<b>Purchased per replant</b><br>
										<input class="form-control" type="number" min="0" max="{{self.newplan.amount}}" ng-model="self.newplan.replant_paid_seed_count">
									</div>
									<div class="col-md-4 col-xs-12">
										<b>Cost per replant</b><br>
										<div class="form-control" style="background:#f7f7f7;">{{self.newplan.get_paid_seed_count(true)}} seed(s) · {{self.newplan.get_cost(1, true)}}g</div>
									</div>
								</div>
							</div>
'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()

    if "self.seed_source = \"buy_all\";" not in text:
        anchor = "\t\tself.auto_replant = false;\ninit();"
        replacement = '''\t\tself.auto_replant = false;
\t\tself.is_auto_replant_cycle = false;
\t\tself.seed_source = "buy_all";
\t\tself.paid_seed_count = 0;
\t\tself.replant_same_source = true;
\t\tself.replant_seed_source = "buy_all";
\t\tself.replant_paid_seed_count = 0;
init();'''
        if anchor not in text:
            raise SystemExit(f"Plan defaults anchor missing in {filename}")
        text = text.replace(anchor, replacement, 1)

    if "self.seed_source = data.seed_source || \"buy_all\";" not in text:
        anchor = "\t\t\tself.auto_replant = !!(data && data.auto_replant);"
        replacement = '''\t\t\tself.auto_replant = !!(data && data.auto_replant);
\t\t\tself.is_auto_replant_cycle = !!(data && data.is_auto_replant_cycle);
\t\t\tself.seed_source = data.seed_source || "buy_all";
\t\t\tself.paid_seed_count = parseInt(data.paid_seed_count || 0);
\t\t\tself.replant_same_source = data.replant_same_source !== false;
\t\t\tself.replant_seed_source = data.replant_seed_source || "buy_all";
\t\t\tself.replant_paid_seed_count = parseInt(data.replant_paid_seed_count || 0);'''
        if anchor not in text:
            raise SystemExit(f"Plan load anchor missing in {filename}")
        text = text.replace(anchor, replacement, 1)

    if "data.seed_source = this.seed_source || \"buy_all\";" not in text:
        anchor = "    if (this.auto_replant) data.auto_replant = true;\n    return data;"
        replacement = '''    if (this.auto_replant) data.auto_replant = true;
    if (this.is_auto_replant_cycle) data.is_auto_replant_cycle = true;
    data.seed_source = this.seed_source || "buy_all";
    if (this.seed_source == "mixed") data.paid_seed_count = this.get_paid_seed_count(false);
    data.replant_same_source = this.replant_same_source !== false;
    if (this.replant_same_source === false){
        data.replant_seed_source = this.replant_seed_source || "buy_all";
        if (this.replant_seed_source == "mixed") data.replant_paid_seed_count = this.get_paid_seed_count(true);
    }
    return data;'''
        if anchor not in text:
            raise SystemExit(f"Plan save anchor missing in {filename}")
        text = text.replace(anchor, replacement, 1)

    if "newplan.is_auto_replant_cycle = !!is_replant_cycle;" not in text:
        text = text.replace(
            "Year.prototype.add_plan = function(newplan, date, auto_replant){",
            "Year.prototype.add_plan = function(newplan, date, auto_replant, is_replant_cycle){",
            1,
        )
        anchor = "\t\tnewplan.auto_replant = !!auto_replant;"
        if anchor not in text:
            raise SystemExit(f"AutoPlant state anchor missing in {filename}")
        text = text.replace(anchor, anchor + "\n\t\tnewplan.is_auto_replant_cycle = !!is_replant_cycle;", 1)
        text = text.replace(
            "this.add_plan(newplan, next_planting, true);",
            "this.add_plan(newplan, next_planting, true, true);",
            1,
        )

    if "Plan.prototype.get_paid_seed_count" not in text:
        anchor = "\tPlan.prototype.get_cost = function(locale){"
        if anchor not in text:
            raise SystemExit(f"Plan cost anchor missing in {filename}")
        text = text.replace(anchor, METHODS + anchor, 1)

    old_cost = '''\tPlan.prototype.get_cost = function(locale){
\t\tvar amount = this.crop.buy * this.amount;
\t\tif (locale) return amount.toLocaleString();
\t\treturn amount;
\t};'''
    new_cost = '''\tPlan.prototype.get_cost = function(locale, replant){
\t\tvar crop_price = this.crop && this.crop.buy ? this.crop.buy : 0;
\t\tvar amount = crop_price * this.get_paid_seed_count(replant);
\t\tif (locale) return amount.toLocaleString();
\t\treturn amount;
\t};'''
    if old_cost in text:
        text = text.replace(old_cost, new_cost, 1)
    elif new_cost not in text:
        raise SystemExit(f"Unexpected Plan cost function in {filename}")

    text = text.replace("var seed_cost = plan.get_cost();", "var seed_cost = plan.get_cost(false, true);")
    path.write_text(text)

index = Path("index.html")
html = index.read_text()

if "class=\"seed-source-options\"" not in html:
    anchor = '\t\t\t\t\t\t\t<div class="col-md-12 col-xs-12 plant-actions">'
    if anchor not in html:
        raise SystemExit("Plant actions anchor missing in index.html")
    html = html.replace(anchor, SEED_UI + "\n" + anchor, 1)

if "Paid Seeds" not in html:
    header_anchor = '\t\t\t\t\t\t\t\t\t\t\t<th class="mobile-hide">Cost</th>'
    if header_anchor not in html:
        raise SystemExit("Planting cost header anchor missing")
    html = html.replace(header_anchor, '\t\t\t\t\t\t\t\t\t\t\t<th class="mobile-hide">Paid Seeds</th>\n' + header_anchor, 1)

    row_anchor = '\t\t\t\t\t\t\t\t\t\t\t<td class="mobile-hide">-{{plan.get_cost(1)}}g</td>'
    if row_anchor not in html:
        raise SystemExit("Planting cost row anchor missing")
    paid_cell = '\t\t\t\t\t\t\t\t\t\t\t<td class="mobile-hide">{{plan.get_paid_seed_count()}}/{{plan.amount}} · {{plan.get_seed_source_label()}}</td>\n'
    html = html.replace(row_anchor, paid_cell + row_anchor, 1)

old_src = './scripts/planner.js?v=indoorcarryover-20260911'
new_src = './scripts/planner.js?v=seedsource-20260911'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner script URL anchor missing")
    html = html.replace(old_src, new_src, 1)
index.write_text(html)

for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert "Plan.prototype.get_paid_seed_count" in text
    assert "newplan.is_auto_replant_cycle = !!is_replant_cycle;" in text
    assert "plan.get_cost(false, true)" in text
assert "seed-source-options" in index.read_text()
assert new_src in index.read_text()
print("Seed source controls and cost calculation added.")
