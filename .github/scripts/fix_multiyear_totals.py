from pathlib import Path

OLD = '''\t\t// Update next year
\t\tif (full_update){
\t\t\tvar next_year = farm.year.next();
\t\t\tif (!next_year) return;
\t\t\tupdate(next_year, true);
\t\t}'''

NEW = '''\t\t// Update the same location bucket in the next year. Passing the Year
\t\t// object here used the current UI mode and accidentally redirected
\t\t// greenhouse/island updates to the main farm in Year 2+.
\t\tif (full_update){
\t\t\tvar next_year = farm.year.next();
\t\t\tif (!next_year) return;
\t\t\tvar next_farm = farm.greenhouse ? next_year.data.greenhouse : next_year.data.farm;
\t\t\tupdate(next_farm, true);
\t\t}'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()
    if NEW not in text:
        if OLD not in text:
            raise SystemExit(f"Expected next-year update block not found in {filename}")
        text = text.replace(OLD, NEW, 1)
        path.write_text(text)

for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert "var next_farm = farm.greenhouse ? next_year.data.greenhouse : next_year.data.farm;" in text
    assert "update(next_year, true);" not in text

# The previous HTML kept the old fixed query string, so browsers could continue
# executing the cached planner.js even after GitHub Pages deployed the source fix.
index = Path("index.html")
html = index.read_text()
old_src = './scripts/planner.js?v=locfix'
new_src = './scripts/planner.js?v=multiyearfix-20260911'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Expected planner script URL not found in index.html")
    index.write_text(html.replace(old_src, new_src, 1))

assert new_src in index.read_text()
print("Multi-year totals fix and cache-busting URL verified.")
