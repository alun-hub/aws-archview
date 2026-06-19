# AWS ArchView Visualization Design (LZA & AWS Official Style)

**Date:** 2026-06-19  
**Status:** Approved  
**Author:** Antigravity (AI Coding Assistant)  

---

## 1. Mål och Syfte
Syftet med denna ändring är att lyfta visualiseringen av Landing Zone Accelerator (LZA)-konfigurationer till att matcha AWS officiella 2D-arkitekturdiagram, samt att lägga till stöd för att visualisera LZA-specifika säkerhetstjänster (Security Hub, GuardDuty, Macie, AWS Config och CloudTrail).

---

## 2. Arkitektur & Komponenter

### 2.1 Parser-ändringar (`src/parser/`)

1. **Konfigurations-typer (`src/parser/types.ts`):**
   * Utöka `LzaConfigs` med `security?: SecurityConfig` och `iam?: IamConfig`.
   * Lägga till nya `NodeKind`-värden för säkerhetstjänster och uppdaterade subnätstyper om det behövs.

2. **Organisationsparser (`src/parser/organizationParser.ts`):**
   * Utöka funktionen `parseOrganization` så att den tar emot `securityConfig?: SecurityConfig` och `iamConfig?: IamConfig`.
   * Om GuardDuty, Security Hub eller Macie är aktiverade i `security-config`, skapas motsvarande service-noder placerade under `Audit`-kontot (eller `LogArchive` om det är centraliserad loggning).
   * Om Identity Center är aktiverat i `iam-config`, läggs en `iam`-nod till under `Management`-kontot.

3. **Nätverksparser (`src/parser/networkParser.ts`):**
   * Ändra hur subnät skapas: Istället för att gruppera alla privata subnät i en gemensam box per VPC, skapar vi **enskilda subnät-noder** i grafen (`subnet:vpcName:subnetName`).
   * Varje subnät-nod får dess `ipv4CidrBlock` och `availabilityZone` sparat i `data`.
   * Identifiera `subnet-public`, `subnet-private`, `subnet-firewall`, och `subnet-tgw` för att ge dem rätt typ och ikon.

---

### 2.2 Layout-motor (`src/components/canvas/elkLayout.ts`)

1. **Subnät Grid-layout:**
   * För VPC-noder ska barnen (subnäten) inte längre läggas i en platt lista.
   * Vi bygger en layout-matris (Grid) inuti VPC:n:
     * **Kolumner:** Motsvarar Availability Zones (t.ex. `a`, `b`, `c`).
     * **Rader:** Motsvarar Tiers (1: Public, 2: Firewall, 3: Private, 4: Data, 5: TGW).
   * Detta beräknar en exakt position `(x, y)` för varje enskild subnät-box och anpassar VPC-kontakternas höjd och bredd därefter.

2. **Övergripande Zonindelning:**
   * Håll `OnPremises`-noder och VPN-kopplingar till kanten av gränssnittet.
   * Säkerställ att Transit Gateway (TGW) är placerad centralt och ritar sina kopplingar till subnäten i VPC:erna på ett snyggt sätt.

---

### 2.3 Visuell Design (`src/components/nodes/` & `src/icons/`)

1. **AWS Group Styles (`src/components/nodes/GroupNode.tsx`):**
   * Rita om `GroupNode` så att den får officiell AWS 2D-stil:
     * **AWS Org (Root):** Rosa streckad ram, rosa "AWS Cloud" eller "Organization"-etikett i hörnet.
     * **AWS OU:** Rosa ram med flik-etikett.
     * **AWS Account:** Orange ram (`#FF9900`) med rubrikflik som visar kontots namn och e-post.
     * **VPC:** Lila ram (`#8C4FFF`) med rubrikflik som visar VPC-namnet och dess CIDR-block.
     * **Subnät:** Streckade ramar (Grön för public, blå för private, röd för firewall, lila för TGW) med dess CIDR-block inuti boxen.

2. **Ikoner (`src/icons/AwsIcon.tsx`):**
   * Lägga till officiella säkerhetsikoner.
   * Om någon ikon saknas ska applikationen varna i konsolen och falla tillbaka på en standard-stiliserad ikon med rätt färgkod.

---

### 2.4 Detaljpanel (`src/components/panels/DetailPanel.tsx`)
* Uppdatera etiketter för fält och nodtyper (t.ex. GuardDuty, Security Hub, AWS Config, SCPs) så att all rådata visas snyggt i högerpanelen när en nod väljs.

---

## 3. Testplan
1. Ladda de 4 existerande YAML-filerna i applikationen (inklusive den nyskapade `security-config.yaml`).
2. Verifiera att organisationsvyn visar konton och OUs med den nya rosa/orangea AWS-designen, samt att säkerhetstjänster som GuardDuty och Security Hub dyker upp under `Audit`-kontot.
3. Verifiera att nätverksvyn ritar ut subnät i ett tydligt rutmönster (AZ kolumnvis, Tier radvis) inuti respektive VPC.
4. Verifiera att kopplingar till Transit Gateway och VPN ritas utan att korsa varandra på ett oläsligt sätt.
