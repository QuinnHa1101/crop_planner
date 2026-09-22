// CONSTANTS
var SEASON_DAYS = 28;
var YEAR_DAYS = SEASON_DAYS * 4;
var VERSION = "2.0";
var DATA_VERSION = "2";


// Save/load helper functions
function SAVE_JSON(key, data){
	var json_data = JSON.stringify(data);
	localStorage.setItem(key + "_v" + DATA_VERSION, json_data);
}

function LOAD_JSON(key, raw_json){
	var json_data = localStorage.getItem(key + "_v" + DATA_VERSION);
	if (!json_data) return;
	if (raw_json) return json_data;
	return JSON.parse(json_data);
}

// Misc helper functions
function round(num, decimals){
	decimals = Math.pow(10, decimals || 0);
	return Math.round(num * decimals) / decimals;
}

// checklist-model fallback (prevents app from failing to bootstrap if the directive file didn't load)
try { angular.module('checklist-model'); } catch (e) { angular.module('checklist-model', []); }

// Angular app
angular.module("planner_app", ["checklist-model"])
	.controller("planner_controller", planner_controller);
	
function planner_controller($scope){
	
	/********************************
		PLANNER VARIABLES
	********************************/
	var self = this; window.planner = self;
	
	// Core data & objects
	self.config = {};
	self.loaded = false;
	self.sidebar;
	self.player;
	self.planner_modal;
	
	// Static planner data
	self.days = new Array(YEAR_DAYS);	// Array of days in a year (only used by one ng-repeat)
	self.seasons = [];					// Array of seasons
	self.SEASON_DAYS = SEASON_DAYS;		// Exposing SEASON_DAYS constant to app scope
	self.crops_list = []; 				// [id, id, ...]
	self.crops = {}; 					// {id: {data}}	
	self.fertilizer = {}; 				// [fertilizer, fertilizer, ...]
	self.events = {};					// Birthdays & festivals
	
	// State objects & variables
	self.years = [];
	
	self.cdate;							// Current date to add plan to
	self.cseason;						// Current season
	self.cmode = "farm";				// Current farm mode (farm / greenhouse)
	self.cview = "all";				// Current view mode (all / farm / greenhouse / island)
	self.cyear;							// Current year
	
	self.newplan;
	self.editplan;
	
	// Core planner functions
	self.update = update;
	self.add_plan = add_plan;
	self.add_plan_key = add_plan_key;
	self.edit_plan = edit_plan;
	self.remove_plan = remove_plan;
	self.clear_season = clear_season;
	self.clear_year = clear_year;
	self.clear_all = clear_all;
	self.open_plans = open_plans;
	
	self.inc_year = inc_year;			// Increment/decrement current year
	self.inc_season = inc_season;		// Increment/decrement current season
	self.set_season = set_season;		// Set current season
	self.cfarm = cfarm;					// Get current farm
	self.in_greenhouse = in_greenhouse; // Check if current farm mode == greenhouse
	self.toggle_mode = toggle_mode;
	self.view_image = view_image;
	self.view_label = view_label;
		// Toggle current farm mode (farm / greenhouse)
	self.set_mode = set_mode;			// Set current farm mode (farm / greenhouse)
	
	self.get_season = get_season;		// Get season object by id
	self.get_date = get_date;			// Get formatted date string
	self.ci_set_sort = ci_set_sort;		// Set key to sort crop info by
	self.planner_valid_crops = planner_valid_crops;
	self.on_crop_change = on_crop_change;
	self.select_crop_search = select_crop_search;
	self.crop_search_blur = crop_search_blur;
	self.ci_sort_icon = ci_sort_icon;
	self.best_fit_crop = best_fit_crop;
	self.best_fit_crops = best_fit_crops;
	self.quick_plant = quick_plant;
	self.suggest_crop = suggest_crop;
	self.has_regrowth_on_day = has_regrowth_on_day;
	
	// Crop info search/filter settings
	self.cinfo_settings = {
		season: "spring",
		seasons: ["spring"],
		season_options: [],
		sort: "name",
		search: "",
		regrows: false,
		order: false,
		use_fbp: false,
	};

	// Crop search state (for the searchable modal picker)
	self.crop_search_text = "";
	self.crop_search_open = false;

	// Legacy section toggle (Settings sidebar)
	self.show_legacy = false;
	
	
	/********************************
		PLANNER INITIALIZATION
	********************************/
	function init(){
		// Initialize planner variables
		self.sidebar = new Sidebar;
		self.player = new Player;
		self.planner_modal  = $("#crop_planner");
		
		for (var i = 0; i < self.days.length; i++) self.days[i] = i + 1;
		self.seasons = [new Season(0), new Season(1), new Season(2), new Season(3)];
		self.cseason = self.seasons[0];
		self.cinfo_settings.season_options = [self.seasons[0], self.seasons[1], self.seasons[2]];
		
		// Enable bootstrap tooltips
		$("body").tooltip({selector: "[data-toggle=tooltip]", trigger: "hover", container: "body"});
		
		// Keydown events
		$(document).keydown(function(e){
			if (planner_event_handler(e)) return;
			if (self.sidebar.keydown(e)) return;
		});
		
		// On modal close: save plans and update
		self.planner_modal.on("hide.bs.modal", function(){
			// Only if currently editing
			if (self.editplan){
				self.editplan = null;
				self.update(self.cyear);
				$scope.$apply();
			}
		});
		
		// Development mode
		// has issues in Firefox, works fine in Chrome
		if (window.location.hash == "#dev"){
			console.log("Development mode enabled.");
			
			// Update CSS every 400 ms
			var stylesheet = $("link[href='style.css']");
			var stylesheet_url = stylesheet.attr("href");
			setInterval(function(){
				var time = Date.now();
				stylesheet.attr("href", stylesheet_url + "?t=" + time);
			}, 400);
		}
		
		// Load planner config data
		$.ajax({
			url: "config.json?v=" + (new Date().getTime()),
			dataType: "json",
			success: function(config){
				self.config = config;
				
				// Process crop data
				$.each(self.config.crops, function(i, crop){
					crop = new Crop(crop);
					self.crops_list.push(crop);
					self.crops[crop.id] = crop;
				});
				
				// Process fertilizer data
				$.each(self.config.fertilizer, function(i, fertilizer){
					fertilizer = new Fertilizer(fertilizer);
					self.config.fertilizer[i] = fertilizer;
					self.fertilizer[fertilizer.id] = fertilizer;
				});
				
				// Process events data (deterministic season order)
				var season_order = ["spring","summer","fall","winter"];
				$.each(season_order, function(s_index, season_name){
					var season = self.config.events[season_name] || [];
					$.each(season, function(ii, c_event){
						c_event.season = s_index;
						c_event = new CalendarEvent(c_event);
						if (!self.events[c_event.date]) self.events[c_event.date] = [];
						self.events[c_event.date].push(c_event);
					});
				});
				
				// Create newplan template
				self.newplan = new Plan;
				
				// Load saved plans from browser storage
				var plan_count = load_data();
				
				// Create first year if it doesn't exist
				if (!self.years.length) self.years.push(new Year(0));
				
				// Set current year to first year
				self.cyear = self.years[0];
				
				// Debug info
				console.log("Loaded " + self.crops_list.length + " crops.");
				console.log("Loaded " + plan_count + " plans into " + self.years.length + " year(s).");
				
				// Update plans
				update(self.years[0].data.farm, true); // Update farm
				update(self.years[0].data.greenhouse, true); // Update greenhouse
				
				self.loaded = true;
				
				// Footer: show data update date (from config.json)
				if (config && config.updated_at){
					$("#footer_version").text("Planner data last updated: " + config.updated_at);
				}
$scope.$apply();
			},
			error: function(xhr, status, error){
				if (!xhr.responseText) return;
				alert("An error occurred in loading planner data. Check the browser console.");
				console.log("Error: ", status);
				console.log("Reason: ", error);
			}
		});
	}
	
	
	/********************************
		CORE PLANNER FUNCTIONS
	********************************/
	// Planner general event handler
	function planner_event_handler(e){
		// Not focused on anything
		if ($(document.activeElement).is("input") || $(document.activeElement).is("textarea")) return;
		
		// Sidebar must be closed
		if (self.sidebar.is_open()) return;
		
		// Planner modal must be closed
		if (self.planner_modal.hasClass("in")) return;
		
		var event_handled = true;
		if (e.which == 39){
			// Right arrow
			self.inc_season(1);
		} else if (e.which == 37){
			// Left arrow
			self.inc_season(-1);
		} else if (e.which == 27){
			// ESC
			self.sidebar.open("cropinfo");
		} else if (e.which == 192){
			// Tilde
			self.toggle_mode();
		} else {
			event_handled = false;
		}
		
		if (event_handled){
			e.preventDefault();
			$scope.$apply();
			return true;
		}
	}
	
	// Save plan data to browser storage
	function save_data(){
		// Save plan data
		var plan_data = [];
		$.each(self.years, function(i, year){
			var year_data = year.get_data();
			//if (!year_data) return; // continue
			plan_data.push(year_data);
		});
		SAVE_JSON("plans", plan_data);
	}
	
	// Load plan data from browser storage
	function load_data(){
		// Load plan data
		var plan_data = LOAD_JSON("plans");
		if (!plan_data) return 0;
		
		var plan_count = 0;
		self.years = [];
		$.each(plan_data, function(i, year_data){
			var new_year = new Year(i);
			plan_count += new_year.set_data(year_data);
			self.years.push(new_year);
		});
		self.cyear = self.years[0];
		
		return plan_count;
	}
	
	// Update planner info of current farm/year
	function update(farm, full_update){
		// Received year, expected farm
		if (farm instanceof Year) farm = farm.farm();
		
		// If farm is null, get first farm/year
		farm = farm || self.years[0].farm();
		
		// Update all years after this one VS just this year
		full_update = full_update || (farm.greenhouse && farm.has_regrowing_crops());
		
		// Reset harvests
		farm.harvests = [];
		
		// Reset financial totals
		farm.totals = {};
		farm.totals.day = {};
		farm.totals.season = [new Finance, new Finance, new Finance, new Finance];
		farm.totals.year = new Finance;
		
		// Rebuild data
		$.each(farm.plans, function(date, plans){
			date = parseInt(date);
			
			$.each(plans, function(i, plan){
				var crop = plan.crop;
				var first_harvest = date + plan.get_grow_time();
				var planting_cost = plan.get_cost();
				var season = self.seasons[Math.floor((plan.date-1)/SEASON_DAYS)];
				var crop_end = crop.end;
				
				if (farm.greenhouse){
					crop_end = YEAR_DAYS;
				}
				
				// Update daily costs for planting
				if (!farm.totals.day[date]) farm.totals.day[date] = new Finance;
				var d_plant = farm.totals.day[date];
				d_plant.profit.min -= planting_cost;
				d_plant.profit.max -= planting_cost;
				
				// Update seasonal costs for planting
				var s_plant_total = farm.totals.season[season.index];
				s_plant_total.profit.min -= planting_cost;
				s_plant_total.profit.max -= planting_cost;
				
				// Update seasonal number of plantings
				s_plant_total.plantings += plan.amount;
				
				// If first harvest of crop occurs after its growth season(s), continue $.each
				// Fruit trees are special: they can be planted any season, but only produce in-season (year-round indoors).
				if (crop.tree && !farm.greenhouse){
					// Tree produces starting the later of: maturity date or the fruit season start.
					first_harvest = Math.max(first_harvest, crop.start);
				}
				if (first_harvest > crop_end) return;
				
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
				
				// Assign harvests to plan object
				plan.harvests = harvests;
				
				// Add up all harvests
				for (var i = 0; i < harvests.length; i++){
					var harvest = harvests[i];
					
					// Update harvests
					if (!farm.harvests[harvest.date]) farm.harvests[harvest.date] = [];
					farm.harvests[harvest.date].push(harvest);
					
					// Update daily revenues from harvests
					if (!farm.totals.day[harvest.date]) farm.totals.day[harvest.date] = new Finance;
					var d_harvest = farm.totals.day[harvest.date];
					d_harvest.profit.min += harvest.revenue.min;
					d_harvest.profit.max += harvest.revenue.max;
					
					// Update seasonal revenues from harvests
					var h_season = Math.floor((harvest.date - 1) / SEASON_DAYS);
					var s_harvest_total = farm.totals.season[h_season];
					s_harvest_total.profit.min += harvest.revenue.min;
					s_harvest_total.profit.max += harvest.revenue.max;
					
					// Update seasonal number of harvests
					s_harvest_total.harvests.min += harvest.yield.min;
					s_harvest_total.harvests.max += harvest.yield.max;
				}
			});
		});
		
		
		// --- Fruit tree carry-over harvests (trees persist across years) ---
		// Trees are planted once, mature after their grow time, and then continue producing in future years.
		// We only add HARVEST revenue here (no planting costs / no planting counts), and only for trees planted in prior years.
		(function add_prior_year_tree_harvests(){
			var cy = farm.year.index;
			if (cy <= 0) return; // no prior years

			// Helper: determine if a plan belongs to this farm location set
			function plan_matches_farm(p){
				var loc = (p && p.location) ? p.location : (farm.greenhouse ? 'greenhouse' : 'farm');
				if (farm.greenhouse) return (loc !== 'farm');
				return (loc === 'farm');
			}

			for (var yi = 0; yi < cy; yi++){
				var py = self.years[yi];
				if (!py || !py.data) continue;

				// Use the corresponding plan set (farm vs greenhouse)
				var pf = farm.greenhouse ? py.data.greenhouse : py.data.farm;
				if (!pf || !pf.plans) continue;

				$.each(pf.plans, function(pdate, plans){
					pdate = parseInt(pdate);
					if (!plans || !plans.length) return;

					$.each(plans, function(i, plan){
						if (!plan || !plan.crop || !plan.crop.tree) return;
						if (!plan_matches_farm(plan)) return;

						var crop = plan.crop;
						var grow_time = plan.get_grow_time();
						var planting_global = (yi * YEAR_DAYS) + pdate;
						var maturity_global = planting_global + grow_time;

						// Determine production window within the CURRENT year
						var year_start_global = (cy * YEAR_DAYS) + 1;
						var year_end_global = year_start_global + YEAR_DAYS - 1;

						var year_round = farm.greenhouse; // greenhouse + island are year-round
						var window_start = year_round ? year_start_global : ((cy * YEAR_DAYS) + crop.start);
						var window_end = year_round ? year_end_global : ((cy * YEAR_DAYS) + crop.end);

						var first_harvest_global = Math.max(maturity_global, window_start);
						if (first_harvest_global > window_end) return;

						var reg = crop.regrow || 1;
						var hcount = Math.floor((window_end - first_harvest_global) / reg);

						for (var h = 0; h <= hcount; h++){
							var h_global = first_harvest_global + (h * reg);
							if (h_global < year_start_global || h_global > year_end_global) continue;

							var h_local = h_global - (cy * YEAR_DAYS);
							var harvest = new Harvest(plan, h_local, (h > 0), cy);

							// Update harvests
							if (!farm.harvests[h_local]) farm.harvests[h_local] = [];
							farm.harvests[h_local].push(harvest);

							// Update daily revenues from harvests
							if (!farm.totals.day[h_local]) farm.totals.day[h_local] = new Finance;
							var d_harvest = farm.totals.day[h_local];
							d_harvest.profit.min += harvest.revenue.min;
							d_harvest.profit.max += harvest.revenue.max;

							// Update seasonal revenues from harvests
							var h_season = Math.floor((h_local - 1) / SEASON_DAYS);
							var s_harvest_total = farm.totals.season[h_season];
							s_harvest_total.profit.min += harvest.revenue.min;
							s_harvest_total.profit.max += harvest.revenue.max;

							// Update seasonal number of harvests
							s_harvest_total.harvests.min += harvest.yield.min;
							s_harvest_total.harvests.max += harvest.yield.max;
						}
					});
				});
			}
		})();



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
							if (plan.crop.tea_bush) return;
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
					var seed_cost = plan.get_cost(false, true);
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

// Add up annual total
		for (var i = 0; i < farm.totals.season.length; i++){
			var season = farm.totals.season[i];
			var y_total = farm.totals.year;
			y_total.profit.min += season.profit.min;
			y_total.profit.max += season.profit.max;
		}
		
		// Update the same location bucket in the next year. Passing the Year
		// object here used the current UI mode and accidentally redirected
		// greenhouse/island updates to the main farm in Year 2+.
		if (full_update){
			var next_year = farm.year.next();
			if (!next_year) return;
			var next_farm = farm.greenhouse ? next_year.data.greenhouse : next_year.data.farm;
			update(next_farm, true);
		}
	}
	
	// Add self.newplan to plans list
	function add_plan(date, auto_replant){
		if (!validate_plan_amount()) return;
		self.cyear.add_plan(self.newplan, date, auto_replant);
		self.newplan = new Plan;
		// Ensure Angular reflects changes immediately (tree plans previously sometimes required a manual refresh).
		try { $scope.$applyAsync(); } catch (e) {}
		try { update(self.cyear, true); } catch (e) {}
		try { save_data(); } catch (e) {}
		}
	
	// Add plan to plans list on enter keypress
	function add_plan_key(date, e){
		if (e.which != 13) return;
		if (!validate_plan_amount()) return;
		add_plan(date);
	}
	
	// Validate newplan amount
	function validate_plan_amount(){
		// Remove all whitespace
		var amount = (self.newplan.amount + "") || "";
		amount = amount.replace(/\s/g, "");
		
		// Is empty string
		if (!amount){
			self.newplan.amount = 1;
			return;
		}
		
		// Check if input is in gold
		if (amount.toLowerCase().endsWith("g")){
			var match = amount.match(/^([0-9]+)g$/i)
			if (!match) return;
			
			var gold = parseInt(match[1] || 0);
			var crop = self.crops[self.newplan.crop_id];
			if (!crop) return;
			amount = Math.floor(gold / crop.buy);
			amount = amount || 1;
			self.newplan.amount = amount;
			return;
		}
		
		// Invalid non-integer amount
		if (!amount.match(/^[0-9]+$/)) return;
		
		// Parse normal integer input
		amount = parseInt(amount || 0);
		if (amount <= 0) return;
		
		return true;
	}
	
	// Edit plan
	function edit_plan(plan, save){
		if (save){
			self.editplan = null;
			save_data();
			update(self.cyear);
			return;
		} else if (self.editplan){
			// Other edit already open
			save_data();
			update(self.cyear);
		}
		
		self.editplan = plan;
	}
	
	// Remove plan from plans list of current farm/year
	function remove_plan(date, index){
		self.editplan = null;
		self.cyear.remove_plan(date, index);
	}
	
	// Remove plans from current farm/season
	function clear_season(season){
		// In All Farms view, clear the visible season from both farm and greenhouse buckets.
		// In greenhouse-only view, clear the entire greenhouse year because greenhouse has no seasons.
		if (self.cview == "all") {
			for (var date = season.start; date <= season.end; date++){
				self.cyear.data.farm.plans[date] = [];
				self.cyear.data.greenhouse.plans[date] = [];
			}
			save_data();
			update(self.cyear.data.farm, true);
			update(self.cyear.data.greenhouse, true);
			return;
		}

		var farm = self.cfarm();
		
		if (self.in_greenhouse()){
			for (var date = self.cyear.start; date <= self.cyear.end; date++){
				farm.plans[date] = [];
			}
		} else {
			for (var date = season.start; date <= season.end; date++){
				farm.plans[date] = [];
			}
		}
		save_data();
		update(self.cyear, true);
	}
	
	// Remove plans from current farm/year
	function clear_year(year){
		// In All Farms view, users expect this to clear both main farm and greenhouse/island data.
		if (self.cview == "all") {
			$.each(year.data.farm.plans, function(date, plans){
				year.data.farm.plans[date] = [];
			});
			$.each(year.data.greenhouse.plans, function(date, plans){
				year.data.greenhouse.plans[date] = [];
			});
			save_data();
			update(year.data.farm, true);
			update(year.data.greenhouse, true);
			return;
		}

		var farm = year.farm();
		var full_update = farm.has_regrowing_crops();
		$.each(farm.plans, function(date, plans){
			farm.plans[date] = [];
		});
		save_data();
		update(year, full_update);
	}
	
	// Remove all plans
	function clear_all(){
		if (!confirm("Permanently clear all plans?")) return;
		self.years = [new Year(0)];
		self.cyear = self.years[0];
		save_data();
		update(null, true);
	}
	
	// Open crop planner modal
	function open_plans(date){
		self.crop_search_text = "";
		self.crop_search_open = false;
		self.planner_modal.modal();
		self.cdate = date;
	}
	
	////////////////////////////////
	
	// Increment/decrement current year; creates new year if necessary
	function inc_year(direction){
		direction = direction > 0 ? true : false;
		
		if (direction){
			// Next year
			self.cyear = self.cyear.next(true);
		} else {
			// Previous year
			var prev_year = self.cyear.previous();
			if (!prev_year) return;
			self.cyear = prev_year;
		}
		// Ensure the newly selected year is (re)computed so carry-over harvests render immediately
		update(self.cyear.data.farm, true);
		update(self.cyear.data.greenhouse, true);
	}
	
	// Increment/decrement current season; creates new year if necessary
	function inc_season(direction){
		direction = direction > 0 ? true : false;
		var next_season = direction ? self.cseason.index + 1 : self.cseason.index - 1;
		
		if (next_season > 3){
			// Next season
			next_season = 0;
			self.cyear = self.cyear.next(true);
		} else if (next_season < 0) {
			// Previous season
			next_season = 3;
			var prev_year = self.cyear.previous();
			if (!prev_year) return;
			self.cyear = prev_year;
		}
		
		self.set_season(next_season);
		// Ensure the newly selected year is (re)computed so carry-over harvests render immediately
		update(self.cyear.data.farm, true);
		update(self.cyear.data.greenhouse, true);
	}
	
	// Set current season
	function set_season(index){
		self.cseason = self.seasons[index];
		self.newplan.crop_id = null;
	}
	
	// Get current farm object of current year
	function cfarm(){
		if (!self.cyear) return {};
		return self.cyear.farm();
	}

	// Combined calendar helpers (farm + greenhouse/island)
	function calendar_plans(date){
		if (!self.cyear) return [];
		var a = (self.cyear.data.farm && self.cyear.data.farm.plans[date]) ? self.cyear.data.farm.plans[date] : [];
		var b = (self.cyear.data.greenhouse && self.cyear.data.greenhouse.plans[date]) ? self.cyear.data.greenhouse.plans[date] : [];
		var all = a.concat(b);
		if (self.cview == "all") return all;
		return all.filter(function(p){
			var loc = p.location || "farm";
			return loc == self.cview;
		});
	}

	function calendar_harvests(date){
		if (!self.cyear) return [];
		var a = (self.cyear.data.farm && self.cyear.data.farm.harvests[date]) ? self.cyear.data.farm.harvests[date] : [];
		var b = (self.cyear.data.greenhouse && self.cyear.data.greenhouse.harvests[date]) ? self.cyear.data.greenhouse.harvests[date] : [];
		var all = a.concat(b);
		if (self.cview == "all") return all;
		return all.filter(function(h){
			var loc = h.location || "farm";
			return loc == self.cview;
		});
	}

	function calendar_totals_day(date){
		var fin = new Finance;
		var a = (self.cyear.data.farm && self.cyear.data.farm.totals && self.cyear.data.farm.totals.day && self.cyear.data.farm.totals.day[date]) ? self.cyear.data.farm.totals.day[date] : null;
		var b = (self.cyear.data.greenhouse && self.cyear.data.greenhouse.totals && self.cyear.data.greenhouse.totals.day && self.cyear.data.greenhouse.totals.day[date]) ? self.cyear.data.greenhouse.totals.day[date] : null;

		// Filter totals to match the active location view so greenhouse/island
		// views don't bleed farm profit (and vice-versa) when the other location is empty.
		var include_farm       = (self.cview === "all" || self.cview === "farm");
		var include_greenhouse = (self.cview === "all" || self.cview === "greenhouse" || self.cview === "island");

		fin.profit.min = (include_farm && a ? a.profit.min : 0) + (include_greenhouse && b ? b.profit.min : 0);
		fin.profit.max = (include_farm && a ? a.profit.max : 0) + (include_greenhouse && b ? b.profit.max : 0);
		return fin;
	}

	// Return totals for the selected season and active location view.
	function calendar_totals_season(season_index){
		var fin = new Finance;
		if (!self.cyear) return fin;

		function add_total(total){
			if (!total) return;
			fin.profit.min += total.profit.min;
			fin.profit.max += total.profit.max;
			fin.plantings += total.plantings;
			fin.harvests.min += total.harvests.min;
			fin.harvests.max += total.harvests.max;
		}

		var farm = self.cyear.data.farm;
		var indoor = self.cyear.data.greenhouse;
		if (self.cview === "all"){
			add_total(farm.totals.season[season_index]);
			add_total(indoor.totals.season[season_index]);
			return fin;
		}
		if (self.cview === "farm"){
			add_total(farm.totals.season[season_index]);
			return fin;
		}

		// Greenhouse and Ginger Island share one data bucket, so calculate
		// these filtered views from each plan's saved location.
		var start = (season_index * SEASON_DAYS) + 1;
		var end = start + SEASON_DAYS - 1;
		for (var date = start; date <= end; date++){
			$.each(indoor.plans[date] || [], function(i, plan){
				if ((plan.location || "greenhouse") !== self.cview) return;
				var cost = plan.get_cost();
				fin.profit.min -= cost;
				fin.profit.max -= cost;
				fin.plantings += plan.amount;
			});
			$.each(indoor.harvests[date] || [], function(i, harvest){
				var location = harvest.plan && harvest.plan.location || "greenhouse";
				if (location !== self.cview) return;
				fin.profit.min += harvest.revenue.min;
				fin.profit.max += harvest.revenue.max;
				fin.harvests.min += harvest.yield.min;
				fin.harvests.max += harvest.yield.max;
			});
		}
		return fin;
	}

	self.calendar_plans = calendar_plans;
	self.calendar_harvests = calendar_harvests;
	self.calendar_totals_day = calendar_totals_day;
	self.calendar_totals_season = calendar_totals_season;

	
	// Check if current farm mode is greenhouse
	
	// Get current view image (for top-left button)
	function view_image(){
        if (self.cview == "all") return "images/all_farms.png";
        if (self.cview == "island") return "images/ginger_island.png";
        if (self.cview == "greenhouse") return "images/greenhouse.png";
        return "images/scarecrow.png";
    }
	// Get current view label
	function view_label(){
		if (self.cview == "all") return "all farms";
		if (self.cview == "farm") return "main farm";
		if (self.cview == "greenhouse") return "greenhouse";
		if (self.cview == "island") return "ginger island";
		return "";
	}

function in_greenhouse(){
		return self.cmode != "farm";
	}
	
	// Toggle current farm mode
	function toggle_mode(){
		var order = ["all","farm","greenhouse","island"];
		var idx = order.indexOf(self.cview);
		if (idx < 0) idx = 0;
		self.cview = order[(idx + 1) % order.length];
		// Keep cmode in sync (cmode drives growth rules + which farm bucket is active)
		if (self.cview == "farm" || self.cview == "all") self.cmode = "farm";
		else if (self.cview == "island") self.cmode = "island";
		else self.cmode = "greenhouse";
		// Recompute current year so view updates immediately
		update(self.cyear.data.farm, true);
		update(self.cyear.data.greenhouse, true);
	}

	
	// Set current farm mode
	function set_mode(mode){
		self.cmode = mode;
		// Keep view consistent when set directly
		if (mode == "farm") self.cview = "farm";
		else if (mode == "greenhouse") self.cview = "greenhouse";
		else if (mode == "island") self.cview = "island";
		update(self.cyear.data.farm, true);
		update(self.cyear.data.greenhouse, true);
	}
	
	////////////////////////////////
	
	// Get season object by id name or date
	function get_season(id){
		// Get season containing a date
		if (typeof id == "number"){
			return self.seasons[Math.floor((id - 1) / SEASON_DAYS)];
		}
		
		// Get season by string ID
		for (var i = 0; i < self.seasons.length; i++){
			if (self.seasons[i].id == id) return self.seasons[i];
		}
	}
	
	// Get formatted date
	function get_date(real_date, format){
		real_date = real_date || self.cdate;
		if (!real_date) return;
		date = real_date % SEASON_DAYS || SEASON_DAYS;
		
		var nth = "th"; // st nd rd th
		if (date <= 3 || date >= 21){
			switch((date % 100) % 10){
				case 1: nth = "st"; break;
				case 2: nth = "nd"; break;
				case 3: nth = "rd"; break;
			}
		}
		
		var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		var day = days[date % 7];
		var season = self.seasons[Math.floor((real_date - 1) / SEASON_DAYS)];
		season = season.name;
		
		var str = format.replace("%l", day)
						.replace("%j", date)
						.replace("%S", nth)
						.replace("%F", season);
		
		return str;
	}
	
	// Set key to sort crop info by
	function ci_set_sort(key){
		if (self.cinfo_settings.sort == key){
			self.cinfo_settings.order = !self.cinfo_settings.order;
		} else {
			self.cinfo_settings.sort = key;
			self.cinfo_settings.order = false;
		}
	}

	// Return a sort direction indicator for a given column key
	function ci_sort_icon(key){
		if (self.cinfo_settings.sort !== key) return '';
		return self.cinfo_settings.order ? ' ↑' : ' ↓';
	}

	// Filter crops that can be planted in the planner's drop down list
	function planner_valid_crops(crop){
		// Restrict special cases
		// Cactus Seeds are greenhouse-only (not Farm or Ginger Island in this planner)
		if (crop.id == "cactus_seeds") return self.cmode == "greenhouse";

		// On greenhouse/island (indoor modes), allow all crops.
		if (self.in_greenhouse()) return true;

		// On farm, only allow crops that can grow in the current season.
		if (crop.tree) return true;

		// On farm, only allow crops that can grow in the current season.
		return crop.can_grow(self.cseason, true);
	}

	// When crop selection changes in the modal, enforce tree rules.
	function on_crop_change(){
		self.newplan.irrigated = false;
		var crop = self.crops[self.newplan.crop_id];
		if (crop && (crop.tree || crop.tea_bush)){
			// Trees cannot use fertilizer in-game, force None and disable UI.
			self.newplan.fertilizer = self.fertilizer["none"];
		}
	}

	// Select a crop from the searchable picker in the planting modal
	function select_crop_search(crop){
		self.newplan.crop_id = crop.id;
		self.crop_search_text = "";
		self.crop_search_open = false;
		self.on_crop_change();
	}

	// Close the crop search dropdown after a short delay (allows clicks to register first)
	function crop_search_blur(){
		setTimeout(function(){
			self.crop_search_open = false;
			$scope.$apply();
		}, 200);
	}

	// Returns true if any harvest on the given date comes from a crop that regrows —
	// meaning the plot is still actively producing and needs no new planting suggestion.
	function has_regrowth_on_day(date){
		var harvests = self.calendar_harvests(date);
		for (var i = 0; i < harvests.length; i++){
			if (harvests[i].crop && harvests[i].crop.regrow) return true;
		}
		return false;
	}

	// Return the most profitable non-regrowable crop that can complete its full growth cycle
	// when planted on the given date. Uses crop.end (not season.end) as the deadline so that
	// cross-season crops like Wheat (Summer+Fall) are correctly included when planted late in
	// their first season. Regrowable crops are always excluded — suggesting one that won't
	// regrow before season end is misleading, and suggesting one "over" a regrowable harvest
	// makes no sense.
	function best_fit_crop(date){
		if (!self.cseason || !self.crops_list.length) return null;

		var best = null;
		var best_profit = -Infinity;

		$.each(self.crops_list, function(i, crop){
			// Cactus Seeds: greenhouse only
			if (crop.id === "cactus_seeds" && self.cmode !== "greenhouse") return;

			// Fruit trees: skip (28-day commitment, wrong tool for this)
			if (crop.tree) return;

			// Crops flagged no_suggest are event-only or otherwise not regularly obtainable
			// (e.g. Qi Beans). Still plantable manually; just never auto-prompted.
			if (crop.no_suggest) return;

			// Regrowable crops: excluded — they won't meaningfully regrow before season end
			// when planted on a late day, and suggesting them over an existing regrowable
			// harvest is confusing (see: Corn, Coffee, Ancient Fruit, etc.)
			if (crop.regrow) return;

			// On farm, crop must be plantable in the current season or span into it
			// (can_grow with is_season=true already passes cross-season crops correctly)
			if (!self.in_greenhouse() && !crop.can_grow(self.cseason, true)) return;

			// Deadline: last day the crop's seasons cover.
			// This is season.end for single-season crops, and naturally extends to the
			// following season's end for cross-season crops (e.g. Wheat: Summer+Fall → day 84).
			// Greenhouse has no season expiry.
			var deadline = self.in_greenhouse() ? (YEAR_DAYS * 10) : crop.end;

			var grow_time = crop.grow;
			if (planner.player.agriculturist){
				grow_time = Math.max(1, grow_time - Math.ceil(grow_time * 0.1));
			}

			// The crop must finish growing on or before its deadline
			if (date + grow_time > deadline) return;

			if (crop.profit > best_profit){
				best_profit = crop.profit;
				best = crop;
			}
		});

		return best;
	}

	// Return the top `limit` fitting crops sorted by profit descending.
	// Uses identical eligibility rules to best_fit_crop.
	function best_fit_crops(date, limit){
		if (!self.cseason || !self.crops_list.length) return [];
		limit = limit || 3;

		var candidates = [];

		$.each(self.crops_list, function(i, crop){
			if (crop.id === "cactus_seeds" && self.cmode !== "greenhouse") return;
			if (crop.tree) return;
			if (crop.no_suggest) return;
			if (crop.regrow) return;
			if (!self.in_greenhouse() && !crop.can_grow(self.cseason, true)) return;

			var deadline = self.in_greenhouse() ? (YEAR_DAYS * 10) : crop.end;
			var grow_time = crop.grow;
			if (planner.player.agriculturist){
				grow_time = Math.max(1, grow_time - Math.ceil(grow_time * 0.1));
			}
			if (date + grow_time > deadline) return;

			candidates.push(crop);
		});

		candidates.sort(function(a, b){ return b.profit - a.profit; });
		return candidates.slice(0, limit);
	}

	// Pre-fill the newplan form with a suggested crop (including inherited fertilizer).
	// Does NOT plant — leaves the user in control of amount, location, and final submit.
	function suggest_crop(crop, date){
		self.newplan.crop_id = crop.id;
		self.newplan.crop = crop;
		self.on_crop_change();

		// Inherit best fertilizer from today's harvests (same logic as quick_plant)
		var fert_rank = {
			"deluxe_fertilizer": 6,
			"quality_fertilizer": 5,
			"basic_fertilizer":   4,
			"hyper_speed_gro":    3,
			"deluxe_speed_gro":   2,
			"speed_gro":          1,
			"none":               0
		};
		var inherited_fert = self.fertilizer["none"];
		var best_rank = 0;
		$.each(self.calendar_harvests(date), function(i, harvest){
			var f = harvest.plan && harvest.plan.fertilizer;
			if (!f || f.is_none()) return;
			var rank = fert_rank[f.id] || 0;
			if (rank > best_rank){
				best_rank = rank;
				inherited_fert = f;
			}
		});
		if (!self.newplan.crop || !self.newplan.crop.tree){
			self.newplan.fertilizer = inherited_fert;
		}

		// Scroll the modal body to the Plant Crop form so the pre-fill is visible
		try {
			var modal = document.getElementById("crop_planner");
			if (modal) modal.querySelector(".modal-body").scrollTop = 0;
		} catch(e){}
	}
	// Called from the calendar cell prompt; stopPropagation prevents the day modal opening.
	function quick_plant(date, event){
		if (event) event.stopPropagation();

		var crop = best_fit_crop(date);
		if (!crop) return;

		// Inherit the best fertilizer from the crops being harvested today.
		// In Stardew, fertilizer stays in the soil after harvest, so the next crop on that
		// plot starts with it already applied. We rank: deluxe > quality > basic >
		// hyper_speed > deluxe_speed > speed_gro > none, and pick the highest available.
		var fert_rank = {
			"deluxe_fertilizer": 6,
			"quality_fertilizer": 5,
			"basic_fertilizer":   4,
			"hyper_speed_gro":    3,
			"deluxe_speed_gro":   2,
			"speed_gro":          1,
			"none":               0
		};
		var inherited_fert = self.fertilizer["none"];
		var best_rank = 0;
		$.each(self.calendar_harvests(date), function(i, harvest){
			var f = harvest.plan && harvest.plan.fertilizer;
			if (!f || f.is_none()) return;
			var rank = fert_rank[f.id] || 0;
			if (rank > best_rank){
				best_rank = rank;
				inherited_fert = f;
			}
		});

		// Build and add the plan
		self.newplan = new Plan();
		self.newplan.crop_id = crop.id;
		self.newplan.crop = crop;
		self.newplan.amount = 1;
		self.newplan.fertilizer = inherited_fert;

		self.cyear.add_plan(self.newplan, date, false);
		self.newplan = new Plan();
		update(self.cyear, true);
		save_data();
	}

	
	
	/********************************
		CLASSES
	********************************/
	/****************
		Sidebar class - controlling the sidebar [single instance]
	****************/
	function Sidebar(){
		var self = this;
		self.mode = "";
		self.crop = null; // crop object
		
		self.keydown = keydown;
		self.open = open_view;
		self.close = close_view;
		self.is_open = is_open;
		self.open_crop = open_crop;
		self.back = back;
		self.export_data = export_data;
		self.import_data = import_data;
		self.legacy_import_data = legacy_import_data;
		
		function keydown(e){
			// Sidebar must be open
			if (!self.is_open()) return;
			
			var event_handled = true;
			if (e.which == 27){
				// ESC
				back();
			} else {
				event_handled = false
			}
			
			if (event_handled){
				e.preventDefault();
				$scope.$apply();
				return true;
			}
		}
		
		function close_view(){
			open_view("");
		}
		
		function is_open(){
			return self.mode != "";
		}
		
		function open_view(view){
			// Toggle off
			if (self.mode == view)
				view = "";
			
			// Clear properties & save on close
			if (!view){
				self.crop = null;
				planner.cinfo_settings.search = "";
				planner.player.save();
				planner.update(null, true);
			} else {
				// Set certain properties on open
				if (planner.cseason.id != "winter")
					planner.cinfo_settings.seasons = [planner.cseason.id];
			}
			
			// Set mode
			self.mode = view;
		}
		
		function back(full_close){
			// back to crop info
			if (self.crop){
				self.crop = null;
				if (!full_close) return;
			}
			
			open_view("");
		}
		
		function open_crop(crop){
			self.mode = "cropinfo";
			self.crop = crop;
		}
		
		function export_data(){
			// Save player
			//planner.player.save();
			
			// Export data
			var out_data = {};
			out_data.plans = LOAD_JSON("plans");
			//out_data.player = LOAD_JSON("player");
			out_data.version = DATA_VERSION;
			
			var blob = new Blob([JSON.stringify(out_data)], {type: "octet/stream"});
			var blob_url = window.URL.createObjectURL(blob);
			
			var link = document.createElement("a");
			link.href = blob_url;
			link.style = "display: none";
			link.download = "Crop Planner [" + Date.now() + "]" + ".json";
			document.body.appendChild(link);
			link.click();
		}
		
		function import_data(){
			var input = $("<input type='file' accept='.json'>").appendTo("body");
			input.css("display", "none");
			input.change(read_file);
			input.click();
		}
		
		function read_file(evt){
			var file = evt.target.files[0];
			if (!file) return;
			
			// Read data from JSON file
			var reader = new FileReader;
			reader.onload = function(e){
				var data = {};
				
				try {
					data = JSON.parse(e.target.result);
				} catch(e){
					alert("Not valid JSON data to import.")
					return;
				}
				
				//if (!data.plans || !data.player){
				if (!data.plans){
					alert("Invalid data to import.")
					return;
				}
				
				if (data.version != DATA_VERSION){
					alert("Incompatible plan version.");
					return;
				}
				
				SAVE_JSON("plans", data.plans);
				//SAVE_JSON("player", data.player);
				
				var plan_count = load_data();
				//planner.player.load();
				update(planner.years[0].data.farm, true); // Update farm
				update(planner.years[0].data.greenhouse, true); // Update greenhouse
				$scope.$apply();
				alert("Successfully imported " + plan_count + " plans into " + planner.years.length + " year(s).");
				console.log("Imported " + plan_count + " plans into " + planner.years.length + " year(s).");
			};
			
			reader.readAsText(file);
		}
		
		function legacy_import_data(){
			if (!confirm("This will attempt to import planner data from the old v1 planner, and will overwrite any current plans. This change is not reversible and is not guaranteed to always work. Continue?")) return;
			
			// Load old v1 planner data
			var plan_data = localStorage.getItem("crops");
			if (!plan_data){ alert("No plan data to import"); return; }
			plan_data = JSON.parse(plan_data);
			if (!plan_data){ alert("No plan data to import"); return; }
			
			// Create new plan data
			var new_plans = [{"farm":{}, "greenhouse":{}}];
			$.each(plan_data, function(date, plans){
				date = parseInt(date);
				$.each(plans, function(i, plan){
					plan.date = date;
					if (!planner.crops[plan.crop]) return; // Invalid crop
					
					if (plan.greenhouse){
						if (!new_plans[0].greenhouse[date]) new_plans[0].greenhouse[date] = [];
						delete plan.greenhouse;
						new_plans[0].greenhouse[date].push(plan);
					} else {
						if (!new_plans[0].farm[date]) new_plans[0].farm[date] = [];
						new_plans[0].farm[date].push(plan);
					}
					
					plan_count++;
				});
			});
			
			// Save data
			SAVE_JSON("plans", new_plans);
			
			// Reload data and update
			var plan_count = load_data();
			update(planner.years[0].data.farm, true); // Update farm
			update(planner.years[0].data.greenhouse, true); // Update greenhouse
			alert("Successfully imported " + plan_count + " legacy plans into " + planner.years.length + " year(s).");
			console.log("Imported " + plan_count + " legacy plans into " + planner.years.length + " year(s).");
		}
	}
	
	
	/****************
		Player class - user-set player configs [single instance]
	****************/
	function Player(){
		var self = this;
		self.level = 0; // farming level; starts at 0
		self.tiller = false;
		self.agriculturist = false;
		
		self.load = load
		self.save = save;
		self.toggle_perk = toggle_perk;
		self.quality_chance = quality_chance;
		self.quality_chance_display = quality_chance_display;
		
		// Miscellaneous client settings
		self.settings = {
			show_events: true,
		};
		
		
		init();
		
		
		function init(){
			load();
			console.log("Loaded player settings");
		}
		
		// Load player config from browser storage
		function load(){
			var pdata = LOAD_JSON("player");
			if (!pdata) return;
			
			if (pdata.tiller) self.tiller = true;
			if (pdata.agriculturist) self.agriculturist = true;
			if (pdata.level) self.level = pdata.level;
			if (pdata.settings) self.settings = pdata.settings;
		}
		
		// Save player config to browser storage
		function save(){
			var pdata = {};
			if (self.tiller) pdata.tiller = self.tiller;
			if (self.agriculturist) pdata.agriculturist = self.agriculturist;
			pdata.settings = self.settings;
			pdata.level = self.level;
			SAVE_JSON("player", pdata);
		}
		
		// Toggle profession perks
		function toggle_perk(key){
			self[key] = !self[key];
			
			// Must have Tiller to have Agriculturist
			if (!self.tiller && key == "tiller"){
				self.agriculturist = false;
			} else if (self.agriculturist && key == "agriculturist"){
				self.tiller = true;
			}
		}
		
		// Get scalar value of chance of crop being 0=regular; 1=silver; 2=gold; 3=iridium quality
		// mult: 0=none, 1=basic fertilizer, 2=quality fertilizer, 3=deluxe fertilizer
		// [SOURCE: StardewValley/Crop.cs : function harvest]
		function quality_chance(quality, mult, locale){
			quality = quality || 0;
			mult = mult || 0;
			
			var gold_chance = 0.2 * (self.level / 10) + 0.2 * mult * ((self.level + 2) / 12) + 0.01;
			var silver_chance = Math.min(0.75, gold_chance * 2);
			// Deluxe Fertilizer (mult=3): iridium chance = gold_chance / 2
			var iridium_chance = (mult >= 3) ? gold_chance * 0.5 : 0;
			
			var chance = 0;
			switch (quality){
				case 0:
					chance = Math.max(0, 1 - (gold_chance + silver_chance));
					break;
				case 1:
					chance = Math.min(1, silver_chance);
					break;
				case 2:
					chance = Math.min(1, gold_chance - iridium_chance);
					break;
				case 3:
					chance = Math.min(1, iridium_chance);
					break;
			}
			
			if (locale) return Math.round(chance * 100);
			return chance;
		}

		// Delegates to quality_chance so the quality bar display always matches profit calculations.
		function quality_chance_display(quality, mult, locale){
			return quality_chance(quality, mult, locale);
		}
	}
	
	
	/****************
		Season class - representing one of the four seasons
	****************/
	function Season(ind){
		var self = this;
		self.index = ind;
		self.id;
		self.name;
		self.start = 0;
		self.end = 0;
		
		
		init();
		
		
		function init(){
			var seasons = ["spring", "summer", "fall", "winter"];
			self.id = seasons[self.index];
			self.name = self.id.charAt(0).toUpperCase() + self.id.slice(1);
			self.start = (self.index * SEASON_DAYS) + 1;
			self.end = self.start + SEASON_DAYS - 1;
		}
	}
	
	Season.prototype.get_image = function(){
		return "images/seasons/" + this.id + ".png";
	};
	
	
	/****************
		Crop class - represents a crop
	****************/
	function Crop(data){
		var self = this;
		
		// Config properties
		self.id;
		self.name;
		self.sell;
		self.buy;
		self.seasons = [];
		self.stages = [];
		self.regrow;
		self.wild = false;
		self.tea_bush = false;
		
		// Harvest data
		self.harvest = {
			min: 1,
			max: 1,
			level_increase: 1,
			extra_chance: 0
		};
		
		// Custom properties
		self.note = "";
		self.start = 0;			// Start of grow season(s)
		self.end = 0;			// End of grow season(s)
		self.grow = 0;			// Total days to grow
		self.profit = 0;		// Minimum profit/day (for crops info menu)
		self.fixed_profit = 0;	// Fixed budget profit
		
		
		init();
		
		
		function init(){
			if (!data) return;
			
			// Base properties
			self.id = data.id;
			self.name = data.name;
			self.sell = data.sell;
			self.buy = data.buy;
			self.seasons = data.seasons;
			self.stages = data.stages;
			self.regrow = data.regrow;
			self.tree = (data.tree) ? true : false;
			self.group = self.tree ? "Fruit Trees" : "Crops";
			if (data.wild) self.wild = true;
			if (data.no_suggest) self.no_suggest = true;
			self.tea_bush = !!data.tea_bush;
			
			// Harvest data
			if (data.harvest.min) self.harvest.min = data.harvest.min;
			if (data.harvest.max) self.harvest.max = data.harvest.max;
			if (data.harvest.level_increase) self.harvest.level_increase = data.harvest.level_increase;
			if (data.harvest.extra_chance) self.harvest.extra_chance = data.harvest.extra_chance;
			
			// Custom properties
			if (data.note) self.note = data.note;
			self.start = get_season(data.seasons[0]).start;
			self.end = get_season(data.seasons[data.seasons.length-1]).end;
			self.grow = 0;
			for (var i = 0; i < data.stages.length; i++){
				self.grow += data.stages[i];
			}
			
			// Calculate profit per day
			var season_days = (self.end - self.start) + 1;
			var regrowths = self.regrow ? Math.floor(((season_days - 1) - self.grow) / self.regrow) : 0;
			
			var plantings = 1;
			if (!regrowths) plantings = Math.floor((season_days - 1) / self.grow);
			var growth_days = (plantings * self.grow) + (regrowths * (self.regrow ? self.regrow : 0));
			
			self.profit -= self.buy * plantings;
			self.profit += self.harvest.min * self.get_sell() * (plantings + regrowths);
			self.profit = round(self.profit / growth_days, 1);
			
			// Calculate fixed budget profit
			var budget = 1000; // 1000g worth of seeds
			var plantings = Math.floor(budget / self.buy);
			var growth_days = self.grow + (regrowths * (self.regrow ? self.regrow : 0));
			
			self.fixed_profit -= self.buy * plantings;
			self.fixed_profit += self.harvest.min * self.get_sell() * (plantings + regrowths);
			self.fixed_profit = round((self.fixed_profit / growth_days), 1);
		}
	}
	
	// Get crop quality-modified sell price
	// [SOURCE: StardewValley/Object.cs : function sellToStorePrice]
	Crop.prototype.get_sell = function(quality){
		quality = quality || 0;
		return Math.floor(this.sell * (1 + (quality * 0.25)));
	};
	
	// Check if crop can grow on date/season
	Crop.prototype.can_grow = function(date, is_season, in_greenhouse){
		var self = this;
		
		// Expected numeric date, received array of seasons
		if (date.constructor === Array){
			var result = false;
			$.each(date, function(i, v){
				result = result || self.can_grow(v, is_season, in_greenhouse);
				if (result) return false; // break on true
			});
			return result;
		}
		
		if (in_greenhouse && (date <= YEAR_DAYS)) return true;
		if (is_season){
			var season = date;
			if (typeof season == "string") season = planner.get_season(season);
			return (this.start <= season.start) && (this.end >= season.end);
		} else {
			return (date >= this.start) && (date <= this.end);
		}
	};
	
	// Get url to Stardew Valley wiki
	Crop.prototype.get_url = function(){
		var fragment = this.id.split("_");
		for (var i=0; i<fragment.length; i++){
			fragment[i] = fragment[i].charAt(0).toUpperCase() + fragment[i].slice(1);
		}
		fragment = fragment.join("_");
		return "http://stardewvalleywiki.com/Crops#"+fragment;
	};
	
	// Get thumbnail image
	Crop.prototype.get_image = function(seeds){
		if (this.wild){
			return "images/seeds/wild_"+this.seasons[0]+".png";
		}
		if (seeds) return "images/seeds/"+this.id+".png";
		return "images/crops/"+this.id+".png";
	};
	
	
	/****************
		Year class - yearly plans
	****************/
	function Year(year_index){
		var self = this;
		self.index = 0;
		self.start = 0;
		self.end = 0;
		self.data = {};
		
		
		init();
		
		
		function init(){
			self.index = year_index;
			self.start = (self.index * YEAR_DAYS) + 1;
			self.end = self.start + YEAR_DAYS - 1;
			
			self.data.farm = new Farm(self);
			self.data.greenhouse = new Farm(self, true);
		}
	}
	
	// Return current Farm object based on planner mode
	Year.prototype.farm = function(){
		// Ginger Island behaves like Greenhouse for crop-season rules, but is stored in the greenhouse plan set.
		var mode = planner.cmode;
		if (mode == "island") mode = "greenhouse";
		return this.data[mode];
	};
	
	// Returns next year
	Year.prototype.next = function(force_create){
		var next_id = this.index + 1;
		if (next_id >= planner.years.length){
			if (!force_create) return;
			var new_year = new Year(next_id);
			planner.years.push(new_year);
			return new_year;
		}
		return planner.years[next_id];
	};
	
	// Returns previous year
	Year.prototype.previous = function(){
		var next_id = this.index - 1;
		if (next_id < 0) return;
		return planner.years[next_id];
	};
	
	// Get data from year (for saving)
	Year.prototype.get_data = function(){
		var self = this;
		var year_plans = {};
		var total_count = 0;
		
		$.each(self.data, function(type, farm){
			var type_plans = {};
			var type_count = 0;
			
			$.each(farm.plans, function(date, plans){
				if (!plans.length) return;
				type_count += plans.length;
				total_count += plans.length;
				type_plans[date] = [];
				
				$.each(plans, function(i, plan){
					type_plans[date].push(plan.get_data());
				});
			});
			
			if (type_count) year_plans[type] = type_plans;
		});
		
		if (!total_count) return;
		return year_plans;
	};
	
	// Load data into year (from loading)
	Year.prototype.set_data = function(l_data){
		var self = this;
		var plan_count = 0;
		
		$.each(l_data, function(type, plan_data){
			$.each(plan_data, function(date, plans){
				date = parseInt(date);
				
				$.each(plans, function(i, plan){
					plan.date = date;
					if (!planner.crops[plan.crop]) return; // Invalid crop
					var plan_object = new Plan(plan, type == "greenhouse");
					self.data[type].plans[date].push(plan_object);
					plan_object.year_index = self.index;
					plan_count++;
				});
			});
		});
		
		return plan_count;
	};
	
	// Add plan to this farm/year
	Year.prototype.add_plan = function(newplan, date, auto_replant, is_replant_cycle){
		// Validate data
		if (!newplan.crop_id) return false;
		
		// Date out of bounds
		if (date < 1 || date > YEAR_DAYS) return false;
		
		// Check that crop can grow
		var crop = planner.crops[newplan.crop_id];
		if (!crop) return false;
		if (!crop.tree && !crop.can_grow(date, false, planner.in_greenhouse())) return false;
		newplan.crop = crop;

		// Fruit tree rules: can be planted any season, never uses fertilizer or irrigated growth bonuses.
		if (crop.tree || crop.tea_bush){
			newplan.irrigated = false;
			if (!newplan.fertilizer || !newplan.fertilizer.id){
				newplan.fertilizer = planner.fertilizer["none"];
			} else {
				newplan.fertilizer = planner.fertilizer[newplan.fertilizer.id] || planner.fertilizer["none"];
			}
		}
		
		// Amount to plant
		newplan.amount = parseInt(newplan.amount || 0);
		if (newplan.amount <= 0) return false;
		
		// Add plan
		newplan.location = planner.cmode;
		newplan.auto_replant = !!auto_replant;
		newplan.is_auto_replant_cycle = !!is_replant_cycle;
		var plan = new Plan(newplan.get_data(), planner.in_greenhouse());
		plan.date = date;
		plan.year_index = this.index;
		plan.year_index = this.index;
		plan.year_index = this.index;
		this.farm().plans[date].push(plan);
		
		// Auto-replanting within current year
		var crop_growth = plan.get_grow_time();
		var next_planting = date + crop_growth;
		var next_grow = next_planting + crop_growth;
		if (!auto_replant || crop.tree || crop.regrow || (auto_replant && !crop.can_grow(next_grow, false, planner.in_greenhouse()))){
			// Update
			update(this);
			save_data();
		} else if (auto_replant){
			// Auto-replant
			this.add_plan(newplan, next_planting, true, true);
		}
	};
	
	// Remove plan from current farm/year
	Year.prototype.remove_plan = function(date, index){
		var farm = this.farm();
		if (!farm.plans[date][index]) return;
		var full_update = farm.plans[date][index].crop.regrow;
		farm.plans[date].splice(index, 1);
		save_data();
		update(this, full_update);
	};
	
	
	/****************
		Farm class - used only within Year
	****************/
	function Farm(parent_year, is_greenhouse){
		var self = this;
		self.year;
		self.greenhouse = false;
		self.plans = {};
		self.harvests = {};
		self.totals = {};
		
		
		init();
		
		
		function init(){
			self.year = parent_year;
			self.greenhouse = is_greenhouse;
			
			for (var i = 0; i < YEAR_DAYS; i++){
				self.plans[i+1] = [];
			}
			self.totals.season = [new Finance, new Finance, new Finance, new Finance];
		}
	}
	
	// Check if farm has crops that regrow; season param optional
	Farm.prototype.has_regrowing_crops = function(season){
		var start_day = 1;
		var end_day = YEAR_DAYS;
		
		if (season){
			start_day = season.start;
			end_day = season.end;
		}
		
		for (var date = start_day; date <= end_day; date++){
			for (var i = 0; i < this.plans[date].length; i++){
				if (this.plans[date][i].crop.regrow){
					return true;
				}
			}
		}
		return false;
	};
	
	// Get image representing farm type
	Farm.prototype.get_image = function(){
		// In this planner, Ginger Island reuses the greenhouse data bucket, so detect by current mode.
		if (typeof planner !== "undefined" && planner.cmode == "island"){
			return "images/ginger_island.png";
		}
		var type = this.greenhouse ? "greenhouse" : "scarecrow";
		return "images/" + type + ".png";
	};
	
	/****************
		Harvest class - represents crops harvested on a date
	****************/
	function Harvest(plan, date, is_regrowth, harvest_year_index){
		var self = this;
		self.date = 0;
		self.plan = {};
		self.crop = {};
		self.yield = {min: 0, max: 0};
		self.revenue = {min: 0, max: 0};
		self.cost = 0;
		self.profit = {min: 0, max: 0};
		self.is_regrowth = false;
		
		
		init();
		
		
		function init(){
			if (!plan || !date) return;
			var crop = plan.crop;
			self.plan = plan;
			self.crop = crop;
			self.date = date;
			
			// Calculate crop yield (+ extra crop drops)
			// [SOURCE: StardewValley/Crop.cs : function harvest]
			self.yield.min = crop.harvest.min * plan.amount;
			self.yield.max = (Math.min(crop.harvest.min + 1, crop.harvest.max + 1 + (planner.player.level / crop.harvest.level_increase))-1) * plan.amount;
			


			// Fruit tree behavior differs from crops:
			// - No extra yield based on Farming level
			// - Quality is determined by tree age (not random chance)
			if (crop.tree){
				self.yield.max = self.yield.min; // always fixed yield

				// Determine fruit quality by tree age since maturity.
				// 0=normal, 1=silver, 2=gold, 4=iridium
				var globalPlant = (plan.year_index * YEAR_DAYS) + plan.date;
				var hy = (typeof harvest_year_index === 'number') ? harvest_year_index : (plan.year_index || 0);
					var globalNow = (hy * YEAR_DAYS) + date;
				var matureDay = globalPlant + 28;
				var yearsSinceMature = Math.floor(Math.max(0, globalNow - matureDay) / YEAR_DAYS);

				var treeQuality = 0;
				if (yearsSinceMature >= 3) treeQuality = 4;
				else if (yearsSinceMature >= 2) treeQuality = 2;
				else if (yearsSinceMature >= 1) treeQuality = 1;

				// Fixed revenue: fruit trees do not use fertilizer-based quality chance.
				var treeSell = crop.get_sell(treeQuality);
				self.revenue.min = treeSell * self.yield.min;
				self.revenue.max = self.revenue.min;
				self.cost = 0; // planting cost is tracked on planting day

				// Tiller profession still applies to fruit (raw produce).
				if (planner.player.tiller){
					self.revenue.min = Math.floor(self.revenue.min * 1.1);
					self.revenue.max = self.revenue.min;
				}
			}
			// Harvest revenue and costs
			var q_mult = 0;
			if (!crop.tree){
			if (plan.fertilizer && !plan.fertilizer.is_none()){
				switch (plan.fertilizer.id){
					case "basic_fertilizer":
						q_mult = 1;
						break;
					case "quality_fertilizer":
						q_mult = 2;
						break;
					case "deluxe_fertilizer":
						q_mult = 3;
						break;
				}
			}
			
			// Fertilizers expire at the beginning of a new season in the greenhouse
			if (self.plan.greenhouse && (planner.get_season(self.date) != planner.get_season(self.plan.date)))
				q_mult = 0;
			
			// Calculate min/max revenue based on regular/silver/gold chance
			var regular_chance = planner.player.quality_chance(0, q_mult);
			var silver_chance = planner.player.quality_chance(1, q_mult);
			var gold_chance = planner.player.quality_chance(2, q_mult);
			var iridium_chance = planner.player.quality_chance(3, q_mult);
			
			var min_revenue = crop.get_sell(0);
			// get_sell(4) = sell*2 (iridium 2x), matching the game's quality=4 internal value
			var max_revenue = (min_revenue*regular_chance) + (crop.get_sell(1)*silver_chance) + (crop.get_sell(2)*gold_chance) + (crop.get_sell(4)*iridium_chance);
			max_revenue = Math.min(crop.get_sell(4), max_revenue);
			
			// Quality from fertilizer only applies to picked harvest
			// and not to extra dropped yields
			self.revenue.min = Math.floor(min_revenue) * self.yield.min;
			self.revenue.max = Math.floor(max_revenue) + (Math.floor(min_revenue) * Math.max(0, self.yield.max - 1));
			self.cost = crop.buy * plan.amount;
			
			// Tiller profession (ID 1)
			// [SOURCE: StardewValley/Object.cs : function sellToStorePrice]
			if (planner.player.tiller){
				self.revenue.min = Math.floor(self.revenue.min * 1.1);
				self.revenue.max = Math.floor(self.revenue.max * 1.1);
			}
			
			}

			// Regrowth
			if (is_regrowth){
				self.is_regrowth = true;
				self.cost = 0;
			}
			
			// Harvest profit
			self.profit.min = self.revenue.min - self.cost;
			self.profit.max = self.revenue.max - self.cost;
		}
	}
	
	Harvest.prototype.get_cost = function(locale){
		if (locale) return this.cost.toLocaleString();
		return this.cost;
	};
	
	Harvest.prototype.get_revenue = function(locale, max){
		var value = max ? this.revenue.max : this.revenue.min;
		if (locale) return value.toLocaleString();
		return value;
	};
	
	Harvest.prototype.get_profit = function(locale, max){
		var value = max ? this.profit.max : this.profit.min;
		if (locale) return value.toLocaleString();
		return value;
	};
	
	
	/****************
		Plan class - represents seeds planted on a date
	****************/
	function Plan(data, in_greenhouse){
		var self = this;
		self.date;
		self.year_index = 0; // which planner year this plan belongs to
		self.year_index = 0; // which planner year this plan belongs to
		self.year_index = 0; // which planner year this plan belongs to
		self.crop_id;
		self.crop = {};
		self.amount = 1;
		self.fertilizer = planner.fertilizer["none"];
		
		self.irrigated = false;
self.harvests = [];
		self.greenhouse = false;
		
		
		
		self.location = "farm";
		self.auto_replant = false;
		self.is_auto_replant_cycle = false;
		self.seed_source = "buy_all";
		self.paid_seed_count = 0;
		self.replant_same_source = true;
		self.replant_seed_source = "buy_all";
		self.replant_paid_seed_count = 0;
init();
		
		
		function init(){
			if (!data) return;
			self.date = data.date;
			self.crop = planner.crops[data.crop];
			self.amount = data.amount;
			
			// default location for legacy plans
			self.location = (data.location) ? data.location : (in_greenhouse ? 'greenhouse' : (planner.cmode || 'farm'));if (data.fertilizer && planner.fertilizer[data.fertilizer])
				self.fertilizer = planner.fertilizer[data.fertilizer];
			if (data && data.irrigated) self.irrigated = true;
			self.greenhouse = in_greenhouse ? true : false;
			self.location = (data && data.location) ? data.location : (self.greenhouse ? (planner.cmode == 'island' ? 'island' : 'greenhouse') : 'farm');
			self.auto_replant = !!(data && data.auto_replant);
			self.is_auto_replant_cycle = !!(data && data.is_auto_replant_cycle);
			self.seed_source = data.seed_source || "buy_all";
			self.paid_seed_count = parseInt(data.paid_seed_count || 0);
			self.replant_same_source = data.replant_same_source !== false;
			self.replant_seed_source = data.replant_seed_source || "buy_all";
			self.replant_paid_seed_count = parseInt(data.replant_paid_seed_count || 0);
		}
	}
	
	// Compile data to be saved as JSON
	Plan.prototype.get_data = function(){
    var data = {};
    data.crop = (this.crop && this.crop.id) ? this.crop.id : this.crop_id;
    data.amount = this.amount;
    if (this.fertilizer && !this.fertilizer.is_none()) data.fertilizer = this.fertilizer.id;
    if (this.irrigated) data.irrigated = true;
    if (this.location) data.location = this.location;
    if (this.auto_replant) data.auto_replant = true;
    if (this.is_auto_replant_cycle) data.is_auto_replant_cycle = true;
    data.seed_source = this.seed_source || "buy_all";
    if (this.seed_source == "mixed") data.paid_seed_count = this.get_paid_seed_count(false);
    data.replant_same_source = this.replant_same_source !== false;
    if (this.replant_same_source === false){
        data.replant_seed_source = this.replant_seed_source || "buy_all";
        if (this.replant_seed_source == "mixed") data.replant_paid_seed_count = this.get_paid_seed_count(true);
    }
    return data;
};

// Location helpers for combined calendar
Plan.prototype.get_location_short = function(){
    switch (this.location){
        case "greenhouse": return "G";
        case "island": return "I";
        default: return "F";
    }
};
Plan.prototype.get_location_label = function(){
    switch (this.location){
        case "greenhouse": return "Greenhouse";
        case "island": return "Ginger Island";
        default: return "Farm";
    }
};

Plan.prototype.get_grow_time = function(){
	var stages = $.extend([], this.crop.stages);

	// Fruit trees ignore fertilizer, irrigated growth reduction, and agriculturist speed bonuses.
	if (this.crop && (this.crop.tree || this.crop.tea_bush)){
		var tdays = 0;
		for (var t = 0; t < stages.length; t++) tdays += stages[t];
		return tdays;
	}

	// Irrigated paddies (near water): available on Farm or Ginger Island (not Greenhouse)
	// Rice Shoots: 8 days (6 when irrigated). Taro Tubers: 10 days (7 when irrigated).
	var remove_days = 0;
	if (this.irrigated && planner.cmode != "greenhouse"){
		if (this.crop.id == "rice_shoot") remove_days += 2;
		else if (this.crop.id == "taro_tuber") remove_days += 3;
	}

	// Data-driven fertilizer growth rate (supports any speed fertilizer in config.json)
	var rate = 0;
	if (this.fertilizer && this.fertilizer.growth_rate) {
		rate += this.fertilizer.growth_rate;
	}

	// Agriculturist profession (ID 5)
	if (planner.player.agriculturist) rate += 0.1;

	if (rate > 0){
		remove_days += Math.ceil(this.crop.grow * rate);
	}

	if (remove_days > 0){
		var multi_remove = 0;
		while (remove_days > 0 && multi_remove < 3){
			for (var i = 0; i < stages.length; i++){
				if (i > 0 || stages[i] > 1){
					stages[i] -= 1;
					remove_days--;
				}
				if (remove_days <= 0) break;
			}
			multi_remove++;
		}
	}

	var days = 0;
	for (var j = 0; j < stages.length; j++){
		days += stages[j];
	}

	return days;
};
	

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

	Plan.prototype.get_cost = function(locale, replant){
		var crop_price = this.crop && this.crop.buy ? this.crop.buy : 0;
		var amount = crop_price * this.get_paid_seed_count(replant);
		if (locale) return amount.toLocaleString();
		return amount;
	};
	
	Plan.prototype.get_revenue = function(locale, max){
		var amount = 0;
		for (var i = 0; i < this.harvests.length; i++){
			amount += max ? this.harvests[i].revenue.max : this.harvests[i].revenue.min;
		}
		if (locale) return amount.toLocaleString();
		return amount;
	};
	
	Plan.prototype.get_profit = function(locale, max){
		var amount = this.get_revenue(max) - this.get_cost();
		if (locale) return amount.toLocaleString();
		return amount;
	};
	
	
	/****************
		Fertilizer class - represents a type of fertilizer
	****************/
	function Fertilizer(data){
		var self = this;
		self.id;
		self.name;
		self.buy = 0;
		self.quality = [0, 0, 0]; // for quality-modifying fertilizers
		self.growth_rate = 0; // for growth-modifying fertilizers
		
		
		init();
		
		
		function init(){
			if (!data) return;
			self.id = data.id;
			self.name = data.name;
			self.buy = data.buy;
			if (data.quality) self.quality = data.quality;
			if (data.growth_rate) self.growth_rate = data.growth_rate;
		}
	}
	
	// Check if fertilizer is not being used ("none" type)
	Fertilizer.prototype.is_none = function(){
		return this.id == "none";
	};
	
	// Get fertilizer image
	Fertilizer.prototype.get_image = function(){
		if (!this.is_none()) return "images/fertilizer/" + this.id + ".png";
	};
	
	
	/****************
		Finance class - datatype for storing financial details of a day/season/year
	****************/
	function Finance(){
		var self = this;
		self.cost = 0;
		self.revenue = {min: 0, max: 0};
		self.profit = {min: 0, max: 0};
		
		self.plantings = 0; // planting count
		self.harvests = {min: 0, max: 0}; // harvest count
	}
	
	// Return cost value
	Finance.prototype.get_cost = function(locale){
		if (locale) return this.cost.toLocaleString();
		return this.cost;
	};
	
	// Return revenue value (min or max)
	Finance.prototype.get_revenue = function(locale, max){
		var value = max ? this.revenue.max : this.revenue.min;
		if (locale) return value.toLocaleString();
		return value;
	};
	
	// Return profit value (min or max)
	Finance.prototype.get_profit = function(locale, max){
		var value = max ? this.profit.max : this.profit.min;
		if (locale) return value.toLocaleString();
		return value;
	};
	
	// Return plantings count
	Finance.prototype.get_plantings = function(locale){
		if (locale) return this.plantings.toLocaleString();
		return this.plantings;
	};
	
	// Return harvests count (min or max)
	Finance.prototype.get_harvests = function(locale, max){
		var value = max ? this.harvests.max : this.harvests.min;
		if (locale) return value.toLocaleString();
		return value;
	};
	
	
	/****************
		Calendar Event class - event on the calendar
	****************/
	function CalendarEvent(data){
		var self = this;
		self.day;
		self.season;
		
		self.date;
		self.name = "";
		self.festival = false;
		self.forage = false;
		
		
		init();
		
		
		function init(){
			if (!data) return;
			self.day = data.day;
			self.season = planner.seasons[data.season];
			
			self.date = (data.season * SEASON_DAYS) + self.day;
			self.name = data.name;
			self.festival = !!data.festival;
			self.forage = !!data.forage;
		}
	}
	
	// Get event image
	CalendarEvent.prototype.get_image = function(){
		if (this.festival) return "images/flag.gif";
		if (this.forage) return "images/forage.svg";
		var image_name = this.name.toLowerCase();
		// The bundled portrait asset keeps the original one-t filename.
		if (image_name == "elliott") image_name = "elliot";
		return "images/people/" + image_name + ".png";
	};
	
	// Get readable text of event
	CalendarEvent.prototype.get_text = function(){
		if (this.festival || this.forage) return this.name;
		return this.name + "'s Birthday";
	};
	
	
	/********************************
		RUN INITIALIZATION
	********************************/
	// Initialization runs last since Function.prototype methods
	// aren't hoisted
	init();
}