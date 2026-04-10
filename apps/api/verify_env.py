"""
ACHP — Environment Verification Script
Run: python verify_env.py
"""
import sys, importlib, json, pathlib

REQUIRED = [
    ("numpy",                 "numpy"),
    ("torch",                 "torch"),
    ("sentence_transformers", "sentence-transformers"),
    ("fakeredis",             "fakeredis"),
    ("pytest",                "pytest"),
]

results = {}
all_ok = True

for mod_name, pkg_name in REQUIRED:
    try:
        mod = importlib.import_module(mod_name)
        ver = getattr(mod, "__version__", "ok")
        results[pkg_name] = {"status": "ok", "version": ver}
    except ImportError as e:
        results[pkg_name] = {"status": "MISSING", "error": str(e)}
        all_ok = False

# Write to file for artifact capture
out = pathlib.Path("verify_env_results.json")
out.write_text(json.dumps(results, indent=2))

# Print to stdout
for pkg, info in results.items():
    icon = "✅" if info["status"] == "ok" else "❌"
    ver  = info.get("version", info.get("error", ""))
    print(f"  {icon} {pkg}: {ver}")

print(f"\nAll deps OK: {all_ok}")
print(f"Results saved → {out.absolute()}")
sys.exit(0 if all_ok else 1)
