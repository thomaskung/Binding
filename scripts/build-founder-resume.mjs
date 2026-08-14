// Builds a synthetic stand-in for the founder's résumé for the Model Spike
// (modal_app/spike.py). The real identifiers (name, employer list, HK address)
// are already committed in tests/redact-known.test.ts and are reused verbatim
// so both the deterministic redact-known layer and the LLM redact layer can be
// exercised. Everything else (email, phone, LinkedIn, school, dates, metrics)
// is invented and must not be treated as the founder's personal data.
//
// Output: test-data/.founder-resume.txt (gitignored). Target ~1,500 tokens so
// a redact pass produces a ~2,000-token output — the same shape that queues at
// ~36s on the current 1.7B/T4 path.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const NAME = "KUNG Siu Kei, Thomas";
const EMAIL = "thomas.kung@example.com";
const PHONE = "+852 5555 1234";
const LINKEDIN = "linkedin.com/in/thomas-kung-tsk";
const ADDRESS =
  "Flat B, 10/F, Tower 2, Island Harbourview, 11 Hoi Fai Road, Tai Kok Tsui, Kowloon, Hong Kong";

const resume = `${NAME}
Chief Information Security Officer
Hong Kong | ${EMAIL} | ${PHONE} | ${LINKEDIN}
${ADDRESS}

PROFESSIONAL SUMMARY
Security executive with 13+ years of progressive experience spanning telecom infrastructure, technology risk consulting, and digital-asset custody. Currently the security director of a post-quantum cryptography software company; previously founded and led the security program for a digital-asset custody platform with $2B assets under custody. Track record of delivering ISO 27001, SOC 2 Type II, and PCI-DSS attestations with no major findings, standing up 24/7 incident response operations, and advising boards on cyber risk in plain language. Deep working knowledge of the Hong Kong and Singapore privacy regimes (PDPO, GDPR) and of defending high-value platforms against targeted APAC threats.

WORK EXPERIENCE

Director of Security — T&S Quantum Limited (Hong Kong), Mar 2024 – Present
- Set the security vision and product-security roadmap for a seed-stage post-quantum cryptography startup; grew the security function from a team of 1 to 6 engineers in the first year.
- Delivered SOC 2 Type II in 8 months and built a continuous compliance pipeline that reduced audit preparation effort by roughly 60%.
- Lead security architecture reviews for the flagship key-management and digital-signing service; threat modeling early in design halved critical design defects before code freeze.
- Operate the public bug-bounty program, triaging and remediating 40+ reports with an average fix SLA of 7 days.

Chief Information Security Officer — Rakkar Digital Pte Ltd (Singapore), Jun 2021 – Feb 2024
- Founded and scaled the security program for a digital-asset custody platform holding $2B in assets under custody and serving clients in over 20 countries.
- Achieved ISO 27001, SOC 2 Type II, and PCI-DSS certifications with zero major findings across all external audits; acted as primary liaison for auditors and regional regulators.
- Rebuilt incident response from scratch — runbooks, on-call rotation, and a 24/7 SOC — cutting mean-time-to-respond from 45 minutes to 12 minutes.
- Presented a quarterly cyber-risk dashboard to the board; a 12-month hardening program lowered cyber-insurance premiums by 20%.
- Led the vendor and third-party risk program covering 150+ relationships, including a deep key-management and cold-storage review of custody partners.

Head of Security & Risk — Crypto.com (Hong Kong), Mar 2018 – May 2021
- Scaled security operations from a 3-person team to 25 analysts and engineers across three regions during a period of 10x platform growth.
- Owned red-team exercises, penetration tests, and the public bug-bounty program; triaged 300+ submissions with a median fix time of 14 days.
- Introduced a security-aware development lifecycle (DevSecOps) that reduced production-severity security defects by 40%.
- Designed the crypto custody security framework — multi-signature approvals, cold-storage isolation, and withdrawal whitelisting — later adopted by the wider digital-asset group.

Senior Consultant — Protiviti Hong Kong Co., Limited (Hong Kong), May 2015 – Feb 2018
- Delivered 20+ information-security and technology-risk engagements for banking, insurance, and fintech clients across Hong Kong and Singapore.
- Led SOX, PCI-DSS, and HKMA cybersecurity readiness assessments; client remediation of the recommendations yielded an estimated $8M in cost savings.
- Ran IT general controls audits and internal-audit support for two global banks; consistently rated in the top 3 of a 40+ consultant cohort.

Senior Network Engineer — PCCW Global Limited Satellite Service (Hong Kong), Aug 2013 – Apr 2015
- Operated satellite backhaul and VSAT links serving 30+ enterprise customers across APAC against a 99.95% availability target.
- Automated fault detection and monitoring, improving mean-time-to-detect from 6 hours to 45 minutes and cutting repeat tickets by a third.

NOC Engineer — Macroview Telecom Limited (Hong Kong), Jun 2011 – Jul 2013
- Monitored multi-vendor telecom and IP infrastructure; resolved 1,500+ incidents with a 98% first-contact-resolution rate.
- Designed the escalation workflow adopted across the regional NOC, reducing after-hours callouts by 25%.

SELECTED ACHIEVEMENTS
- Built a post-quantum threat-assessment framework used to brief two financial regulators on migration risk and readiness.
- Spoke at five APAC security conferences on digital-asset custody, key management, and supply-chain security.
- Published technical papers on secure-enclave design and key-management best practices for custody platforms.

EDUCATION
- Master of Science in Information Technology, The Hong Kong University of Science and Technology, 2011
- Bachelor of Engineering in Electronic and Computer Engineering, The Hong Kong University of Science and Technology, 2009

CERTIFICATIONS
- Certified Information Systems Security Professional (CISSP), ISC2, 2019
- Certified Information Security Manager (CISM), ISACA, 2018
- Certified Ethical Hacker (CEH), EC-Council, 2014

TECHNICAL SKILLS
Security strategy and governance | ISO 27001 | SOC 2 | PCI-DSS | NIST CSF | CIS v8 | threat modeling | incident response | digital-asset custody security | multi-signature and cold-storage key management | post-quantum cryptography | DevSecOps | SIEM (Splunk, Microsoft Sentinel) | cloud security (AWS, Azure, GCP) | penetration testing | vendor risk management | board-level reporting | PDPO | GDPR | SQL | Python | Linux | network and firewall architecture | IDS/IPS | endpoint detection and response

REFERENCES
Available upon request.
`;

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test-data",
  ".founder-resume.txt",
);
writeFileSync(outPath, resume, "utf8");

const words = resume.split(/\s+/).length;
const estTokens = Math.round(resume.length / 4);
console.log(`Wrote ${outPath}`);
console.log(`chars=${resume.length} words=${words} estTokens(4c/t)≈${estTokens}`);
