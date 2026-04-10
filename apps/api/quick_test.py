import urllib.request, json, time, sys

url = 'http://localhost:8000/analyze'
payload = json.dumps({'claim': 'Regular exercise reduces heart disease risk by 30-40%', 'offline': True}).encode()
req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        result = json.loads(r.read())
        elapsed = round((time.time()-t0)*1000)
        tr = result['transparency_report']
        print(f"Status: {r.status}")
        print(f"Time: {elapsed}ms")
        print(f"Run ID: {result['run_id']}")
        print(f"Verdict: {result['verdict']}")
        print(f"Confidence: {result['verdict_confidence']}")
        print(f"Composite: {tr['composite_score']}")
        print(f"CTS={tr['cts']} PCS={tr['pcs']} BIS={tr['bis']} NSS={tr['nss']} EPS={tr['eps']}")
        print(f"NIL verdict: {tr['nil_verdict']}")
        print(f"Pipeline mode: {tr['pipeline_mode']}")
        print(f"Radar axes: {[rd['axis'] for rd in tr['radar_chart_data']]}")
        print(f"Alt perspectives: {len(result['alternative_perspectives'])}")
        print(f"Verified answer[:150]: {result['verified_answer'][:150]}")
        print()
        print("FULL KB_USED:", result.get('kb_used'))
        print("SUCCESS!")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
