
# SecureAccess — Mobile Application Security Project

Starter implementation for an Expo React Native app + Express API + MySQL/MariaDB.

## Features included
- Registration and login with Argon2id password hashing
- TOTP two-factor authentication setup and verification
- JWT access tokens
- Server-enforced ADMIN and USER roles
- AES-256-GCM encryption/decryption demo and HMAC-SHA-256 integrity demo
- Audit log table
- Database backup script (use Windows Task Scheduler to automate)
- Expo mobile app screens for register, login, 2FA verification, dashboard and security demos
- Local XAMPP and AWS deployment notes

> Educational project starter. Do not use as-is for production or store real sensitive data before independent security review. Tokens are stored in memory in this starter; use Expo SecureStore for a production mobile app. TOTP secrets need stronger lifecycle handling, rate limits, recovery codes, and encryption at rest before production.

## 1. Requirements
Install:
- Node.js LTS: https://nodejs.org/
- VS Code: https://code.visualstudio.com/
- XAMPP: https://www.apachefriends.org/
- Expo Go on your phone: https://expo.dev/client

## 2. Create database with XAMPP
1. Open XAMPP Control Panel and start **MySQL** (Apache is not required for this Node API).
2. Open `http://localhost/phpmyadmin`.
3. Create a database named `secureaccess`.
4. Import `database/schema.sql`.

For local classwork, XAMPP's default MySQL-compatible MariaDB user is often `root` with a blank password. This is only a local development default. Set a password for any database exposed beyond your own machine.

## 3. Start the API
Open a terminal in `backend`:

```powershell
Copy-Item .env.example .env
npm install
```

Edit `.env`. Generate secrets in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run this twice and use different values for `JWT_SECRET` and `DATA_ENCRYPTION_KEY` (key must be 64 hex characters for 32 bytes). Set `TOTP_ENCRYPTION_KEY` to another 64-character hex key. Do not commit `.env`.

Then:
```powershell
npm run dev
```
Health check: `http://localhost:4000/health`

## 4. Start Expo mobile app
Open a second terminal in `mobile`:
```powershell
npm install
```
Create `.env` from `.env.example` and set `EXPO_PUBLIC_API_URL`.
- Android emulator: `http://10.0.2.2:4000`
- Physical phone on same Wi-Fi: `http://YOUR_PC_LAN_IP:4000` (find IP with `ipconfig`)
- Do not use `localhost` from a physical phone; it means the phone itself.

Then:
```powershell
npx expo start
```
Scan the QR code using Expo Go. Phone and PC must be on the same Wi-Fi. Expo's official getting-started guide: https://docs.expo.dev/get-started/create-a-project/

### Deploy the web app to Netlify

The repository-root `netlify.toml` configures Netlify to run `npm ci --include=dev && npm run export:web` from `mobile`, then publish `mobile/dist`. Dependency installation is explicit so CLI-driven deploys also install the locked Expo SDK and build tooling before exporting. The `export:web` script uses the project's installed Expo CLI rather than downloading an unrelated latest version through `npx`. This is an Expo application, not a plain HTML site; publishing the repository root without a build does not deploy the app.

Set `EXPO_PUBLIC_API_URL` in Netlify to the deployed HTTPS API URL before deploying. This public setting is included in the web bundle and must not contain secrets. The Express API and its database must be hosted separately; this configuration deploys only the frontend. Without this setting, the app attempts to reach `localhost:4000` on the visitor's computer. The API must allow requests from the deployed site's origin in its CORS configuration.

## 5. Test core flow
1. Register the first account. It is created as `USER` by default.
2. Login with email/password. If 2FA is not enabled, the API returns a temporary token plus a TOTP enrollment URI. For a classroom demo, enter that URI into an authenticator app manually. A later iteration can add a QR-code display.
3. In the app, enable 2FA using the current 6-digit code from your authenticator.
4. Log out, log in again, and enter the code when prompted.
5. Role-protected admin route is `GET /api/admin/overview`. A normal user should receive `403`.
6. Security demo endpoints are `POST /api/security/encrypt` and `POST /api/security/integrity`.

## 6. Make an administrator account
Never allow public signup to choose their own role. After registering your own account, run this SQL in phpMyAdmin, replacing the email:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```
Log out and log in again to receive a token with the new role.

## 7. Backups
From the `backend` folder, run:
```powershell
npm run backup
```
The script invokes `mysqldump` (included with XAMPP). If it cannot find `mysqldump`, set `MYSQLDUMP_PATH` in `.env` to your XAMPP path, e.g. `C:\\xampp\\mysql\\bin\\mysqldump.exe`.
To automate, use Windows Task Scheduler to run `npm.cmd` with arguments `run backup` in the backend folder. Keep backup files outside the public web root, restrict access, encrypt them, and test restoration.

## 8. AWS deployment overview
Recommended class project architecture:
- Backend: AWS Elastic Beanstalk (Node.js)
- Database: Amazon RDS for MySQL
- Secrets: Elastic Beanstalk environment properties initially; AWS Secrets Manager is preferable for production
- Backups: RDS automated backups plus scheduled encrypted exports to a private S3 bucket if required

Never expose the RDS database publicly for convenience. Put the database in private networking and allow inbound MySQL only from the backend environment's security group. Use HTTPS for the API. Set environment variables in the AWS console; never upload `.env`.

Before deploying:
1. Create an AWS account and configure billing alerts.
2. Create an RDS MySQL database and note endpoint, database name, username, and password.
3. Configure the backend environment variables in Elastic Beanstalk.
4. Deploy the backend with the AWS EB CLI or console (see `docs/AWS_DEPLOYMENT.md`).
5. Set `EXPO_PUBLIC_API_URL` to the deployed HTTPS API URL and rebuild/restart Expo.
6. Run smoke tests from the phone.

AWS services can incur charges. Review pricing, set budgets/alerts, and delete test resources when finished.

## Important limitations to disclose in the report
- This is an educational prototype, not a certified production security system.
- Implement production rate limiting, email verification, password reset, TOTP recovery codes, refresh-token rotation/revocation, secure mobile token storage, TLS-only deployment, and centralized secret management before real-world use.
- The encryption endpoint is a demonstration of authenticated encryption; production data models must define which fields require encryption and how keys rotate.
- The HMAC endpoint demonstrates integrity checks. A plain SHA-256 hash alone is not an authenticity mechanism if an attacker can also modify the hash.
