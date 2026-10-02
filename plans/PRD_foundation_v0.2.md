# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# DR. METZ WORKSPACE — CSSE
## Document Governance, Security, Workflow & AI Intelligence Mini App

**Version:** 0.2 — Foundation Architecture  
**Date:** 2 October 2026  
**Parent Ecosystem:** Dr. Metz Ecosystem  
**Product:** Dr. Metz Workspace  
**Module:** CSSE — Document & Governance Mini App  
**Status:** Foundation PRD / Ready for Technical Breakdown

---

# 0. INSTRUKSI UTAMA UNTUK DEVELOPER & AI CODING AGENT

Dokumen ini bukan sekadar daftar fitur.

PRD ini harus diperlakukan sebagai **arsitektur fondasi** agar CSSE dapat berkembang dan tetap terhubung dengan seluruh Dr. Metz Ecosystem tanpa perlu membangun ulang integrasi di kemudian hari.

## Aturan yang tidak boleh dilanggar

1. **Jangan membuat CSSE sebagai aplikasi silo.**
2. **Jangan menghubungkan fitur langsung satu sama lain secara hard-coded jika fungsi tersebut seharusnya tersedia melalui service/API/tool layer.**
3. **Semua modul harus mempunyai kontrak data yang jelas.**
4. **Semua resource utama harus mempunyai stable unique ID.**
5. **Google Drive adalah storage awal, bukan database utama aplikasi.**
6. **Database CSSE menyimpan index, metadata, permission, workflow, audit, dan reference ke external resource.**
7. **AI tidak boleh mengakses resource langsung tanpa melalui authentication + permission layer.**
8. **Setiap integrasi eksternal harus berada di Integration/MCP Layer.**
9. **Business logic tidak boleh bergantung pada satu AI provider.**
10. **Setiap fitur baru harus diasumsikan suatu hari akan digunakan oleh aplikasi lain di Dr. Metz Ecosystem.**
11. **Jika implementasi membutuhkan asumsi yang tidak tertulis dalam PRD, tandai sebagai `DECISION REQUIRED`; jangan membuat business rule permanen sendiri.**
12. **Security, auditability, interoperability, dan data consistency lebih penting daripada menambah banyak fitur pada MVP.**

Prinsip engineering:

> **Build once, expose as a service, reuse everywhere.**

---

# 1. PROBLEM STATEMENT

Masalah utama bukan sekadar file yang berantakan.

Masalah sebenarnya adalah **organizational memory fragmentation**.

Saat ini informasi dapat tersebar di:

- Google Drive
- folder berbeda
- email
- WhatsApp
- komputer pribadi
- link
- staf tertentu
- kepala divisi
- manajemen
- ingatan orang

Akibatnya ketika Owner membutuhkan dokumen penting, organisasi masih bergantung pada pertanyaan:

> “File ini ada di siapa?”

Kemudian seseorang harus mencari orang lain, membuka chat, mencari folder, meminta link, memastikan versi file, dan memastikan apakah file tersebut masih berlaku.

Hal ini menciptakan:

- dependency terhadap manusia tertentu
- kehilangan waktu
- duplicate file
- versi dokumen tidak jelas
- permission tidak konsisten
- dokumen sensitif berisiko tersebar
- approval sulit dilacak
- tidak ada institutional memory
- AI sulit digunakan karena data tidak mempunyai struktur dan permission yang konsisten

CSSE dibangun untuk mengubah kondisi tersebut.

---

# 2. PRODUCT VISION

CSSE menjadi **Document Governance & Intelligence Layer** di dalam Dr. Metz Workspace.

Tujuannya bukan mengganti Google Drive.

Tujuannya adalah membuat semua dokumen organisasi:

**Findable → Structured → Permissioned → Traceable → Actionable → AI-readable**

dengan tetap menjaga security.

Target pengalaman akhirnya:

Owner dapat bertanya:

> “Cari izin operasional klinik Jakarta yang terbaru.”

Sistem memahami permintaan tersebut, memeriksa identitas dan permission, mencari metadata/resource yang benar, lalu memberikan file atau informasi yang relevan.

User tidak perlu mengetahui file berada di folder mana.

---

# 3. POSITION IN DR. METZ ECOSYSTEM

```text
DR. METZ ECOSYSTEM
        │
        ├── Identity / DrMetz ID
        │
        ├── Workspace
        │      │
        │      └── CSSE
        │           ├── Document Registry
        │           ├── Security & Permission
        │           ├── Correspondence
        │           ├── Approval Workflow
        │           ├── Search
        │           ├── Audit
        │           └── AI Document Intelligence
        │
        ├── Clinic Systems
        ├── CRM
        ├── Beauty Tracker
        ├── AEVIA
        ├── Stratum
        ├── Qilens
        └── Future Apps
```

CSSE harus dapat menjadi service yang kelak digunakan oleh aplikasi lain.

Contoh:

AEVIA suatu hari membutuhkan kontrak partner.

AEVIA tidak membuat document management sendiri.

AEVIA meminta resource kepada CSSE melalui API/MCP sesuai permission user.

---

# 4. ARCHITECTURE PRINCIPLE

Arsitektur minimum:

```text
USER / OTHER DR. METZ APP
          │
          ▼
AUTHENTICATION / IDENTITY
          │
          ▼
AUTHORIZATION / PERMISSION ENGINE
          │
          ▼
CSSE APPLICATION SERVICES
          │
     ┌────┼──────────────┐
     ▼    ▼              ▼
DOCUMENT WORKFLOW      SEARCH
REGISTRY ENGINE        ENGINE
     │    │              │
     └────┼──────────────┘
          ▼
AI ORCHESTRATION LAYER
          │
          ▼
INTEGRATION / MCP LAYER
     ┌────┼─────────┐
     ▼    ▼         ▼
 DRIVE  GMAIL    AI PROVIDERS
```

Tidak boleh:

```text
Frontend → Google Drive → AI
```

untuk dokumen protected.

Harus:

```text
Frontend
→ Identity
→ Permission Check
→ CSSE Service
→ Integration Layer
→ Google Drive
→ Authorized Context
→ AI
→ Output Policy Check
→ User
```

---

# 5. API-FIRST + MCP-READY FOUNDATION

CSSE harus **API-first** dan **MCP-ready** sejak versi pertama.

MCP bukan pengganti seluruh internal API.

Internal service mempunyai API/service contract yang stabil.

MCP menyediakan tool interface agar AI Agent dapat menggunakan capability tersebut dengan aman.

## Contoh capability

```text
search_documents
get_document_metadata
get_authorized_document
create_document_record
update_document_metadata
request_document_access
submit_for_approval
approve_document
reject_document
list_pending_approvals
search_correspondence
get_audit_history
```

Tool tersebut tidak boleh bypass permission engine.

Contoh:

```text
AI Agent
   │
   ▼
MCP Tool
   │
   ▼
CSSE Authorization
   │
   ├── Allowed → Execute
   │
   └── Denied  → Reject
```

---

# 6. CANONICAL DATA MODEL

Struktur data harus dibuat sebelum memperluas fitur.

## 6.1 User

```text
user_id
drmetz_identity_id
name
email
role_id
division_id
status
created_at
updated_at
```

## 6.2 Role

```text
role_id
role_name
role_level
permissions
```

Role awal:

- Owner / Super Admin
- General Manager
- Division User

Role harus extensible.

---

## 6.3 Division

```text
division_id
division_name
business_unit_id
manager_user_id
status
```

---

## 6.4 Document

```text
document_id
external_provider
external_resource_id
external_url
document_name
document_type
category_id
division_id
business_unit_id
security_level
owner_user_id
pic_user_id
status
version
effective_date
expiry_date
created_at
updated_at
```

**Penting:** jangan gunakan URL Google Drive sebagai primary identity dokumen.

Gunakan `document_id` internal + `external_resource_id`.

---

## 6.5 Permission

```text
permission_id
resource_type
resource_id
principal_type
principal_id
permission_type
granted_by
created_at
expires_at
```

`principal_type` dapat berupa:

- USER
- ROLE
- DIVISION

`permission_type` antara lain:

- VIEW
- OPEN
- EDIT_METADATA
- UPDATE_RESOURCE
- DOWNLOAD
- SHARE
- REVIEW
- APPROVE
- REJECT
- ARCHIVE
- MANAGE_PERMISSION

---

## 6.6 Approval

```text
approval_id
resource_id
workflow_id
requested_by
current_step
status
created_at
completed_at
```

---

## 6.7 Audit Event

Audit menggunakan konsep event.

```text
event_id
actor_user_id
actor_email
action
resource_type
resource_id
timestamp
result
source
metadata
```

Contoh:

```text
DOCUMENT_OPENED
DOCUMENT_CREATED
DOCUMENT_UPDATED
ACCESS_DENIED
APPROVAL_REQUESTED
DOCUMENT_APPROVED
DOCUMENT_REJECTED
PERMISSION_CHANGED
AI_DOCUMENT_QUERIED
```

---

# 7. USER & ACCESS MODEL

## Owner / Super Admin

Owner mempunyai akses tertinggi.

Dapat:

- melihat seluruh dokumen
- mengatur permission
- mengatur role
- melihat audit
- mengatur security classification
- memberikan approval final
- mengakses seluruh divisi

---

## General Manager

GM mempunyai akses luas terhadap operasional dan dokumen lintas divisi sesuai policy.

Namun Owner dapat menandai resource atau action tertentu sebagai:

```text
OWNER_APPROVAL_REQUIRED
```

Dengan demikian GM tidak otomatis mempunyai kewenangan absolut.

---

## Division User

User divisi melihat resource berdasarkan:

```text
Identity
+ Role
+ Division
+ Resource Permission
+ Security Level
```

Jangan hanya menggunakan role-based access.

Gunakan kombinasi **RBAC + resource-level permission**.

---

# 8. SECURITY CLASSIFICATION

Dokumen memiliki klasifikasi security.

Draft awal:

```text
LEVEL 1 — INTERNAL
LEVEL 2 — CONTROLLED
LEVEL 3 — CONFIDENTIAL
LEVEL 4 — RESTRICTED
LEVEL 5 — EXECUTIVE
```

Security level bukan satu-satunya permission mechanism.

Security level memberikan policy dasar.

Permission engine menentukan akses final.

---

# 9. DOCUMENT ORGANIZATION

Tiga dimensi utama yang diminta:

### 1. Security / Urgency

Seberapa sensitif atau tinggi verifikasi dokumen.

### 2. Division

Dokumen berasal dari atau dikelola oleh divisi mana.

### 3. Human / PIC

Siapa yang bertanggung jawab terhadap dokumen.

Secara konseptual:

```text
SECURITY
   ↓
DIVISION
   ↓
PIC
   ↓
DOCUMENT
```

Tetapi jangan memaksa struktur database menjadi nested folder hierarchy.

Gunakan metadata agar satu dokumen dapat dicari dari berbagai dimensi.

---

# 10. GOOGLE DRIVE STRATEGY

Untuk MVP:

> **Google Drive = File Storage**  
> **CSSE = Control + Index + Intelligence**

CSSE tidak perlu menduplikasi semua binary file.

CSSE menyimpan:

- document ID
- Drive resource ID
- URL
- metadata
- division
- category
- PIC
- security
- permission
- status
- approval state
- version reference
- expiry information

Google Drive connector ditempatkan di integration layer.

---

# 11. SEARCH

Terdapat dua sistem pencarian.

## A. Structured Search

Filter berdasarkan:

- nama
- keyword
- division
- security level
- category
- PIC
- owner
- status
- tanggal
- expiry
- approval status

Filter dapat digabung.

---

## B. AI Search

Workspace menyediakan chat.

Contoh:

> “Cari izin klinik Jakarta.”

> “Apa dokumen legal yang belum selesai?”

> “Cari kontrak terakhir PT X.”

> “Apa saja yang sedang menunggu approval saya?”

AI melakukan:

```text
Intent Understanding
↓
Identity Check
↓
Permission Scope
↓
Search / Retrieval
↓
Authorized Context
↓
Reasoning
↓
Response
```

---

# 12. AI SECURITY RULE

Rule absolut:

> **AI ACCESS MUST NEVER EXCEED USER ACCESS.**

AI tidak boleh:

- membaca unauthorized file
- merangkum unauthorized file
- memberikan unauthorized link
- mengungkap isi protected document
- bypass security melalui semantic search
- bypass security melalui embeddings/vector database

Permission filtering harus dilakukan **sebelum context diberikan ke model**.

Ini juga berlaku untuk vector search.

---

# 13. AI PROVIDER ABSTRACTION

Jangan membuat business logic bergantung langsung pada satu AI vendor.

Buat:

```text
AI ORCHESTRATOR
      │
      ├── Provider A
      ├── Provider B
      ├── Local Model
      └── Future Provider
```

AI dapat digunakan untuk:

- classification
- summarization
- extraction
- semantic search
- comparison
- document Q&A
- metadata suggestion
- workflow assistance

Keputusan security tetap deterministic dan tidak diserahkan kepada LLM.

---

# 14. CORRESPONDENCE

Ada dua pola utama.

## Top → Down

```text
Owner
 ↓
GM
 ↓
Division
 ↓
Staff
```

Contoh:

- instruksi
- memo
- kebijakan
- surat keputusan
- assignment

---

## Bottom → Up

Contoh:

```text
Staff
 ↓
Division
 ↓
GM
 ↓
Owner
```

Tetapi workflow tidak selalu linear.

Harus mendukung:

```text
Staff → Owner

Division → GM

Division → Owner

GM → Owner
```

Karena itu jangan hard-code hierarchy sebagai workflow.

Gunakan **configurable workflow engine**.

---

# 15. APPROVAL ENGINE

Status dasar:

```text
DRAFT
↓
SUBMITTED
↓
IN REVIEW
↓
APPROVED / REJECTED
↓
DISTRIBUTED
↓
ARCHIVED
```

Workflow dapat memiliki:

```text
workflow_id
workflow_type
steps[]
approver_rule
escalation_rule
final_approver
```

Approval dapat ditentukan berdasarkan:

- document type
- division
- security level
- user
- business unit

---

# 16. AUDIT TRAIL

Minimum setiap event mencatat:

### WHO
Siapa yang melakukan.

### WHAT
Apa aktivitasnya.

### WHEN
Tanggal dan jam.

### IDENTITY
Email/account yang digunakan.

### RESOURCE
Dokumen/surat/resource mana.

### RESULT
Berhasil, ditolak, approved, rejected, dll.

Audit event tidak dapat diubah oleh regular user.

---

# 17. EXPIRY & VERSIONING

Dokumen dapat mempunyai:

```text
version
effective_date
expiry_date
renewal_date
supersedes_document_id
```

Use case:

- izin klinik
- kontrak
- SIP
- STR
- MoU
- sewa
- sertifikat

Sistem dapat memberikan reminder kepada PIC.

---

# 18. MCP / INTEGRATION LAYER

Integrasi pertama:

## Google Drive

Capability:

- search authorized resources
- read metadata
- retrieve authorized content
- detect file changes
- link resource ke CSSE record

## Gmail

Capability:

- search authorized email
- mengambil attachment
- menghubungkan email dengan document record
- correspondence workflow

## AI

AI digunakan melalui orchestration layer, bukan menjadi pemilik permission.

---

# 19. MCP TOOL CONTRACT PRINCIPLE

Setiap MCP tool harus:

1. menerima authenticated identity/context
2. mempunyai input schema jelas
3. melakukan authorization
4. melakukan action
5. menghasilkan structured response
6. membuat audit event bila relevan
7. tidak mengembalikan data di luar permission

Contoh konseptual:

```json
{
  "tool": "search_documents",
  "input": {
    "query": "izin klinik jakarta",
    "division_id": null,
    "security_level": null
  }
}
```

Response:

```json
{
  "status": "success",
  "results": [],
  "permission_scope_applied": true
}
```

---

# 20. COMMAND CENTER

Home Workspace harus menjawab:

> “Apa yang membutuhkan perhatian saya sekarang?”

Cards awal:

- Waiting Approval
- New Documents
- Recent Activity
- Restricted Activity
- Upcoming Expiry
- Correspondence
- Documents Requiring Action

Owner dan user lain melihat dashboard berbeda berdasarkan permission.

---

# 21. MAIN NAVIGATION

```text
COMMAND CENTER

DOCUMENTS
 ├─ All Documents
 ├─ My Documents
 ├─ Division
 ├─ Recent
 └─ Restricted

SEARCH
 ├─ Filter Search
 └─ Ask AI

CORRESPONDENCE
 ├─ Inbox
 ├─ Outbox
 ├─ Draft
 └─ Archive

APPROVAL
 ├─ Waiting for Me
 ├─ Submitted
 ├─ Approved
 └─ Rejected

ACTIVITY

ADMINISTRATION
 ├─ Users
 ├─ Roles
 ├─ Divisions
 ├─ Categories
 ├─ Permissions
 ├─ Security Levels
 └─ Integrations
```

---

# 22. MVP — MUST HAVE

MVP bukan demo UI.

MVP harus membuktikan fondasi arsitektur.

Wajib:

1. Authentication
2. Canonical User ID
3. User management
4. Role management
5. Division management
6. Document Registry
7. Google Drive connector
8. Metadata
9. Security classification
10. Resource permission
11. Structured search
12. AI chat search
13. Correspondence
14. Flexible approval workflow
15. Audit trail
16. Gmail integration
17. MCP/tool layer
18. AI provider abstraction

---

# 23. MVP — NON-GOALS

Untuk menjaga fokus, MVP tidak perlu terlebih dahulu:

- mengganti Google Drive
- membuat office editor sendiri
- membuat email server
- membuat AI model sendiri
- membuat full enterprise DMS
- memindahkan seluruh file lama sekaligus
- membuat fitur dekoratif yang tidak memperbaiki retrieval, security, workflow, atau audit

---

# 24. DEFINITION OF DONE

Fitur tidak dianggap selesai hanya karena UI sudah muncul.

Sebuah capability dianggap selesai bila:

```text
UI
✓

API / SERVICE
✓

DATA MODEL
✓

PERMISSION
✓

AUDIT
✓

ERROR HANDLING
✓

INTEGRATION CONTRACT
✓

MCP EXPOSURE (jika applicable)
✓

DOCUMENTATION
✓

TEST
✓
```

---

# 25. ACCEPTANCE SCENARIOS

## Scenario 1 — Finding a Permit

Owner:

> “Cari izin operasional klinik Jakarta terbaru.”

Expected:

- AI memahami intent.
- Search menggunakan CSSE index.
- Permission diverifikasi.
- Sistem menemukan document record.
- Resource Google Drive yang tepat dikembalikan.
- Jika beberapa versi ada, sistem mengidentifikasi versi aktif berdasarkan metadata.
- Aktivitas dicatat jika diperlukan.

---

## Scenario 2 — Division Access

User HR mencoba membuka dokumen Executive Finance.

Expected:

```text
ACCESS DENIED
```

AI juga tidak boleh menjawab pertanyaan berdasarkan dokumen tersebut.

---

## Scenario 3 — GM Approval

GM mencoba menjalankan action pada dokumen:

```text
OWNER_APPROVAL_REQUIRED
```

Expected:

Sistem membuat approval request ke Owner, bukan menjalankan action langsung.

---

## Scenario 4 — Bottom-Up Letter

Staff membuat surat dan memilih:

```text
Staff → Division Head → Owner
```

Expected:

Workflow berjalan sesuai route tersebut tanpa diwajibkan melewati GM.

---

## Scenario 5 — AI Provider Change

Provider AI utama diganti.

Expected:

Document registry, permission, workflow, audit, dan Google Drive integration tetap berjalan tanpa redesign database.

---

# 26. FUTURE READINESS

Fondasi CSSE harus memungkinkan penambahan:

- Google Calendar
- WhatsApp/business messaging
- digital signature
- OCR
- contract intelligence
- automatic expiry monitoring
- organization knowledge graph
- vector search
- other cloud storage
- mobile app
- clinic-specific workspace
- cross-business-unit search
- autonomous AI Agent
- task automation
- external partner portal

Semua melalui service/integration layer yang sama.

---

# 27. SUCCESS METRIC

North-star operational question:

> **“Berapa cepat orang yang berhak dapat menemukan dokumen yang benar tanpa bertanya kepada orang lain?”**

Metrics:

- median document retrieval time
- percentage dokumen dengan PIC
- percentage dokumen dengan security classification
- approval turnaround time
- expired documents detected before expiry
- number of failed unauthorized access attempts
- percentage AI searches returning correct authorized resource
- reduction of manual “file ada di siapa?” requests

---

# 28. FINAL SYSTEM PRINCIPLE

CSSE tidak dibangun sebagai tempat menyimpan link.

CSSE dibangun sebagai **organizational memory infrastructure** untuk Dr. Metz Ecosystem.

Fondasinya adalah:

```text
IDENTITY
   +
STANDARDIZED DATA
   +
PERMISSION
   +
DOCUMENT REGISTRY
   +
WORKFLOW
   +
AUDIT
   +
API
   +
MCP
   +
AI
```

Urutan tersebut penting.

> **AI berada di atas struktur yang rapi. AI bukan pengganti struktur yang rapi.**

Jika fondasi ini konsisten, CSSE dapat dimulai sebagai mini app sederhana hari ini dan berkembang menjadi shared document intelligence infrastructure untuk seluruh Dr. Metz Ecosystem tanpa perlu membangun ulang dari nol.
