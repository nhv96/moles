Run python3 -m http.server 8080 in the file’s folder, 
then cloudflared tunnel --url http://localhost:8080 in another terminal.

```bash
python3 -m http.server 8080
```

```bash
cloudflared tunnel --url http://localhost:8080
```