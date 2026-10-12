
# AWS deployment checklist

Use the current AWS documentation because console labels and platform versions can change:
- Elastic Beanstalk Node.js: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html
- EB QuickStart: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/nodejs-quickstart.html
- RDS integration: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.rds.html

## Cost and security
AWS resources can cost money. Set a budget/alert before creating them. For a student demonstration, choose the smallest suitable options and delete resources after assessment if no longer needed.

## High-level steps
1. Create AWS account and enable MFA on the root user. Do not use root credentials for CLI work.
2. Pick one AWS region and use it consistently.
3. Create an Elastic Beanstalk Node.js environment for the `backend` folder.
4. Create an Amazon RDS MySQL database. Prefer private networking. Its security group should allow port 3306 only from the backend environment security group, not `0.0.0.0/0`.
5. Configure the backend environment variables in Elastic Beanstalk:
   `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATA_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY`, `CLIENT_ORIGIN`.
6. Use long random secrets; do not use the `.env.example` placeholders. Prefer AWS Secrets Manager for production secrets.
7. Deploy API and test `/health` over HTTPS. Configure HTTPS with an appropriate certificate/domain before production use.
8. Set `EXPO_PUBLIC_API_URL` to the HTTPS API URL in `mobile/.env`; rebuild/restart the Expo app.
9. Run end-to-end tests for register, login, 2FA, user access, denied admin access, admin access, encryption and integrity.
10. Enable RDS automated backups and test restore. If assignment specifically requires application-managed automatic backups, configure a scheduled secure export as well.

## Important database migration note
Run `backend/database/schema.sql` against the RDS database during initial setup, using a secure method. Do not expose the database publicly just to import the schema. Do not put production database passwords in source code or commit them to Git.
