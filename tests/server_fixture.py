import json, tempfile
from http.server import ThreadingHTTPServer
from backend.server import Service, make_handler
with tempfile.TemporaryDirectory() as root:
    service=Service(root)
    server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(service))
    print(json.dumps({'port':server.server_port,'token':service.token}),flush=True)
    try: server.serve_forever()
    finally: server.server_close(); service.pool.shutdown(wait=True)
