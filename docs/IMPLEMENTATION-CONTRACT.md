# Shared implementation contract

Next.js App Router, TypeScript, Node 24 built-in node:sqlite, React. Local explicitly enabled DEMO_MODE=true. No hosted credentials needed. Application UI is a SPA in src/app/page.tsx with /login etc optional catchall via shared component. All data via same-origin API, cookie auth. Money integer paise.

## HTTP

- GET /api/session => {user: User|null, demoMode:boolean}
- POST /api/auth/login {email,password} => {user}
- POST /api/auth/register {name,email,password,role:'CLIENT'|'FREELANCER'} => {user}
- POST /api/auth/logout => {ok:true}
- GET /api/bootstrap => {user, users: User[], projects: Project[], milestones: Milestone[], agreements: Agreement[], submissions: Submission[], ledger: Ledger[], disputes: Dispute[], recoveries: Recovery[], checkins: Checkin[], notifications: Notification[], audit: Audit[], now:string, demoMode:boolean}. Users are public id/name/email/role only, scoped relevant directory; all other rows membership scoped/admin. JSON object columns parsed. Entities use camelCase. dates ISO strings. All IDs strings.
- POST /api/actions {type, projectId?, milestoneId?, ...payload} => {ok:true, ...result}; errors {error:string} with proper HTTP status.
- POST /api/uploads multipart fields milestoneId, description, url(optional), file(single) => {ok:true,submission}
- GET /api/files/:submissionId authorized attachment
- POST /api/scope {category,description} => {source:'Rule-based suggestions',criteria:string[]}
- GET /api/handover/:recoveryId authorized JSON handover

## Entities (required minimum; backend may add fields)

User: id,name,email,role
Project: id,title,description,category,clientId,freelancerId,budget,currency,startDate,deadline,scope,exclusions,revisionPolicy,acceptancePolicy,disputePolicy,status,risk,riskReasons:string[],lastActivityAt,createdAt
Milestone: id,projectId,title,description,requirements,budget,dueDate,criteria:string[],allowedTypes:string[],maxFileSize,revisionLimit,reviewHours,status,paymentStatus,funded,paid,refunded,revisionCount,submittedAt?,acceptedAt?,assignedFreelancerId
Agreement: id,projectId,version,snapshot:any,hash,clientAcceptedAt?,freelancerAcceptedAt?,createdAt,status
Submission: id,projectId,milestoneId,freelancerId,version,fileName,mime,size,hash,description,url?,verification:{checks:{name,result,explanation}[],criteria:{criterion,result,explanation}[],source:string},createdAt
Ledger: id,projectId,milestoneId,type,amount,status,createdAt,reference
Dispute: id,projectId,milestoneId,openedBy,reason,status,outcome?,rationale?,statements:{userId,text,createdAt}[],createdAt
Recovery: id,projectId,reason,status,replacementId?,handover:any,createdAt
Checkin: id,projectId,freelancerId,status,comment,createdAt
Notification: id,userId,projectId?,message,read:boolean,createdAt
Audit: id,projectId,actorId,action,detail,createdAt

## Actions

createProject: {title,description,category,freelancerId,budget,currency:'INR',startDate,deadline,scope,exclusions,revisionPolicy,acceptancePolicy,disputePolicy,milestones:[{title,description,requirements,budget,dueDate,criteria:string[],allowedTypes:string[],maxFileSize,revisionLimit,reviewHours}]}
acceptAgreement: {projectId,agreementId}
rejectAgreement: {projectId,agreementId,reason}
fund: {milestoneId}
start: {milestoneId}
review: {milestoneId,decision:'ACCEPT'|'REVISION',reason?,criterion?}
payout: {milestoneId}
checkin: {projectId,status:'ON_TRACK'|'BLOCKED'|'NEED_EXTENSION',comment}
amend: {projectId,reason,scope?,milestoneId?,dueDate?} (creates version, pauses work until mutual signatures; cannot change payment)
dispute: {milestoneId,reason}
statement: {disputeId,text}
resolve: {disputeId,outcome:'RELEASE'|'REFUND'|'PARTIAL'|'REVISION'|'CONTINUE'|'CANCEL',rationale,payoutAmount?} (admin only)
intervene: {projectId,reason}
withdraw: {projectId,reason}
recover: {projectId,reason}
inviteReplacement: {recoveryId,freelancerId} (fresh milestones, prior funds remain frozen pending settlement, new agreement and no transfer of entitlement)
markRead: {notificationId} ('all' supported)
updateProfile: {name}
advanceClock: {hours} (demo admin only)
runJobs: {} (admin)
resetDemo: {} (demo admin only)

## Demo accounts

client@milestoneguard.demo / DemoPass123!
freelancer@milestoneguard.demo / DemoPass123!
replacement@milestoneguard.demo / DemoPass123!
admin@milestoneguard.demo / DemoPass123!

## Backend exported entry points for tests/scripts

src/lib/db.ts: getDb(), migrate(), closeDb() (DATABASE_PATH env, default data/milestoneguard.sqlite)
src/lib/service.ts: bootstrap(user), action(user,payload), runJobs(), now()
src/lib/auth.ts: register(input), authenticate(email,password) => User (session route handles cookie)
src/lib/seed.ts: seedDemo(), resetDemo()
Backend agent may amend this contract but MUST notify collaborators of changes. Tests may use HTTP interfaces if exports differ.
