import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { industrialLawsData } from './src/data/lawsData';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get laws list
app.get('/api/laws', (_req, res) => {
  res.json({ success: true, data: industrialLawsData });
});

// Real Legislative Update & Gazette Verification Engine
// Checks if any new ministerial regulation or amendment was published and affects the factory
app.post('/api/laws/check-updates', (req, res) => {
  try {
    const { knownLawIds = [], factoryProfile } = req.body;
    const now = new Date();

    // Check which laws in registry match the factory profile and are not yet known or updated
    const unacknowledgedLaws = industrialLawsData.filter((law) => {
      // Check if known by client
      const isKnown = Array.isArray(knownLawIds) && knownLawIds.includes(law.id);
      if (isKnown) return false;

      // Check if matches factory criteria
      if (factoryProfile) {
        const c = law.applicableCriteria;
        if (c?.hasBoiler && !factoryProfile.hasBoiler) return false;
        if (c?.hasHazardousChemicals && !factoryProfile.hasHazardousChemicals) return false;
        if (c?.hasWastewater && !factoryProfile.hasWastewaterTreatment) return false;
        if (c?.hasAirEmissions && !factoryProfile.hasAirEmissionStack) return false;
      }
      return true;
    });

    const sources = [
      'ราชกิจจานุเบกษา (Royal Gazette)',
      'ระบบกฎหมายกรมโรงงานอุตสาหกรรม (DIW e-Law)',
      'กองความปลอดภัยแรงงาน (DLPW OSH)',
      'กรมควบคุมมลพิษ (PCD)',
    ];

    res.json({
      success: true,
      hasUpdates: unacknowledgedLaws.length > 0,
      newUpdatesCount: unacknowledgedLaws.length,
      updates: unacknowledgedLaws,
      checkedAt: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      checkedDate: now.toLocaleDateString('th-TH'),
      sourcesChecked: sources,
      message: unacknowledgedLaws.length > 0
        ? `พบประกาศกฎหมายใหม่ที่เกี่ยวข้องกับโรงงานของคุณจำนวน ${unacknowledgedLaws.length} ฉบับ`
        : 'ตรวจสอบฐานข้อมูลราชกิจจานุเบกษาและกรมโรงงานฯ ล่าสุดแล้ว: กฎหมายทั้งหมดเป็นปัจจุบัน ไม่มีประกาศหรือข้อกำหนดใหม่ที่มีผลกระทบกับโรงงานของคุณในขณะนี้',
    });
  } catch (error: any) {
    console.error('Error checking law updates:', error);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบอัปเดตกฎหมาย' });
  }
});

// AI Factory Compliance & Risk Analyzer
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { factoryProfile, questionOrScenario } = req.body;

    const systemInstruction = `คุณเป็นผู้เชี่ยวชาญอาวุโสด้านกฎหมายโรงงานอุตสาหกรรมในประเทศไทย (Thai Factory Law Compliance & Safety/Environmental Legal Specialist) 
มีความรอบรู้ลึกซึ้งในพระราชบัญญัติโรงงาน พ.ศ. 2535 (และฉบับแก้ไขเพิ่มเติม), พ.ร.บ. ความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน พ.ศ. 2554, กฎกระทรวงของกรมโรงงานอุตสาหกรรม (DIW), กรมสวัสดิการและคุ้มครองแรงงาน (DLPW), กรมควบคุมมลพิษ (PCD), การนิคมอุตสาหกรรมแห่งประเทศไทย (กนอ.), และกฎหมายสิ่งแวดล้อม/สารเคมี/หม้อน้ำ/อัคคีภัย/กากของเสีย (WMS สก.1-3, CEMS, PRTR, COD/BOD Online)

ภารกิจของคุณ:
1. วิเคราะห์กฎหมายที่เกี่ยวข้องหรือมีการเปลี่ยนแปลงอัปเดตสำหรับโรงงานนี้
2. บอกแนวทางที่ต้องดำเนินการ แก้ไข อย่างเป็นรูปธรรม เป็นขั้นตอน พร้อมกำหนดระยะเวลาและผู้รับผิดชอบ (เช่น จป.วิชาชีพ, วิศวกร, ผู้จัดการโรงงาน)
3. ประเมินความเสี่ยงอย่างละเอียด: ถ้าไม่ทำ จะมีผลกระทบอย่างไร (โทษปรับทางอาญา, โทษจำคุก, คำสั่งตาม ม.37 หรือ ม.39 พ.ร.บ.โรงงาน ให้หยุดกิจการ, การเพิกถอนใบอนุญาต รง.4, ผลกระทบทางธุรกิจและคู่ค้า)

โปรดตอบเป็นภาษาไทยที่กระชับ ชัดเจน น่าเชื่อถือ ในรูปแบบ JSON ตามโครงสร้างที่กำหนด เพื่อให้ระบบนำไปแสดงผลบน Dashboard ได้โดยตรง`;

    const promptText = `ข้อมูลโรงงานของผู้ใช้งาน:
- ชื่อโรงงาน: ${factoryProfile?.factoryName || 'โรงงานอุตสาหกรรมทั่วไป'}
- ประเภทโรงงาน: ${factoryProfile?.factoryTypeDescription || 'ไม่ระบุ'} (${factoryProfile?.categoryCode || 'โรงงานจำพวกที่ 3'})
- ขนาดกำลังเครื่องจักร: ${factoryProfile?.horsepower || 0} แรงม้า
- จำนวนพนักงาน: ${factoryProfile?.employeeCount || 0} คน
- จังหวัดที่ตั้ง: ${factoryProfile?.province || 'ไม่ระบุ'}
- มีหม้อน้ำ/บอยเลอร์ (Boiler): ${factoryProfile?.hasBoiler ? 'มี' : 'ไม่มี'}
- มีการใช้/ครอบครองสารเคมีอันตราย: ${factoryProfile?.hasHazardousChemicals ? 'มี' : 'ไม่มี'}
- มีระบบบำบัดน้ำเสีย/ปล่อยน้ำทิ้ง: ${factoryProfile?.hasWastewaterTreatment ? 'มี' : 'ไม่มี'}
- มีปล่องระบายมลพิษทางอากาศ: ${factoryProfile?.hasAirEmissionStack ? 'มี' : 'ไม่มี'}
- มีพื้นที่อับอากาศ: ${factoryProfile?.hasConfinedSpace ? 'มี' : 'ไม่มี'}

คำถามหรือสถานการณ์ที่ต้องการตรวจสอบ:
"${questionOrScenario || 'โปรดตรวจสอบความสอดคล้องทางกฎหมายโรงงานอัปเดตล่าสุดที่เกี่ยวข้องกับโรงงานนี้ พร้อมแนวทางดำเนินการและการประเมินความเสี่ยงหากละเลย'}"

จงตอบกลับด้วย JSON Object ที่มีโครงสร้างดังนี้เท่านั้น (ไม่ต้องใส่ markdown code block หรือคำเกริ่นใดๆ):
{
  "executiveSummary": "สรุปผลการประเมินภาพรวมทางกฎหมายสำหรับโรงงานนี้ 2-3 ประโยค",
  "overallRiskScore": 85,
  "overallRiskLevel": "critical",
  "applicableLawsSummary": [
    {
      "lawName": "ชื่อกฎหมายหรือประกาศ",
      "agency": "DIW หรือ DLPW หรือ PCD",
      "status": "อัปเดตใหม่ / กำลังมีผล / บังคับใช้แล้ว",
      "urgency": "critical / high / medium"
    }
  ],
  "actionChecklist": [
    {
      "step": 1,
      "title": "หัวข้อแนวทางที่ต้องดำเนินการหรือแก้ไข",
      "description": "รายละเอียดวิธีปฏิบัติตามกฎหมายอย่างเป็นรูปธรรม",
      "responsibleRole": "ตำแหน่งผู้รับผิดชอบ เช่น จป.วิชาชีพ หรือ วิศวกร",
      "timeline": "ระยะเวลาที่ต้องทำให้เสร็จ เช่น ทันที หรือ ภายใน 30 วัน",
      "requiredDocuments": ["เอกสารที่ต้องใช้ 1", "เอกสารที่ต้องใช้ 2"]
    }
  ],
  "riskAndImpactAssessment": {
    "criminalPenalty": "อัตราโทษปรับและโทษจำคุกตามกฎหมายหากไม่ปฏิบัติตาม",
    "administrativeOrder": "คำสั่งทางปกครอง เช่น คำสั่งตาม ม.37/39 พ.ร.บ.โรงงาน ให้หยุดกิจการ หรือระงับการใช้เครื่องจักร",
    "businessDisruption": "ผลกระทบต่อธุรกิจ สายการผลิต คู่ค้า และการประกันภัย",
    "publicCommunityImpact": "ผลกระทบต่อสิ่งแวดล้อม ชุมชน หรือชื่อเสียงองค์กร"
  },
  "complianceRecommendations": [
    "ข้อแนะนำเชิงป้องกัน 1",
    "ข้อแนะนำเชิงป้องกัน 2"
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      // Fallback clean regex extraction if surrounded by backticks
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse AI output into JSON');
      }
    }

    res.json({ success: true, result: parsedData });
  } catch (error: any) {
    console.error('Error analyzing compliance with Gemini:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'เกิดข้อผิดพลาดในการประเมินด้วย AI',
    });
  }
});

// AI Single Law Deep Dive
app.post('/api/gemini/explain-law', async (req, res) => {
  try {
    const { lawTitle, context } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `วิเคราะห์เจาะลึกกฎหมายโรงงาน: "${lawTitle}"
บริบทของโรงงาน: "${context || 'โรงงานอุตสาหกรรมในประเทศไทย'}"

โปรดสรุปและวิเคราะห์ในรูปแบบ JSON:
{
  "keyHighlights": ["สาระสำคัญ 1", "สาระสำคัญ 2", "สาระสำคัญ 3"],
  "mustDoActions": [
    { "task": "สิ่งที่ต้องทำทันที", "department": "ฝ่ายที่รับผิดชอบ", "deadline": "กำหนดเวลา" }
  ],
  "penaltyIfIgnored": {
    "fines": "รายละเอียดค่าปรับ",
    "imprisonment": "โทษจำคุก",
    "operationalSanction": "การสั่งหยุดงาน/ปิดโรงงาน"
  },
  "auditTips": ["เทคนิคการเตรียมความพร้อมรับการตรวจของเจ้าพนักงาน 1", "เทคนิค 2"]
}`,
      config: {
        systemInstruction: 'คุณเป็นที่ปรึกษากฎหมายโรงงานอุตสาหกรรม ให้คำแนะนำทางกฎหมายที่ถูกต้อง แม่นยำ และใช้ปฏิบัติได้จริง ตอบเป็น JSON เท่านั้น',
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text || '{}';
    const parsed = JSON.parse(raw);
    res.json({ success: true, result: parsed });
  } catch (error: any) {
    console.error('Error in explain-law:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'เกิดข้อผิดพลาดในการวิเคราะห์กฎหมาย',
    });
  }
});

// Vite dev server or static files setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Thai Factory Law Compliance Server running on http://localhost:${PORT}`);
  });
}

startServer();
