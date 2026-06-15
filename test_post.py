import http.client, json
conn = http.client.HTTPConnection('127.0.0.1', 8000)
payload = json.dumps({"name":"Test Car","miles":"1000","trans":"Auto","fuel":"Petrol","year":"2022","price":"1000000","img":"Pic/test.jpg","badge":True})
headers = {'Content-Type':'application/json'}
conn.request('POST','/api/cars', body=payload, headers=headers)
res = conn.getresponse()
print(res.status, res.reason)
print(res.read().decode())
