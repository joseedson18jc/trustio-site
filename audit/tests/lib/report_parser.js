import fs from 'fs';
import path from 'path';

/**
 * Parses markdown tables into an array of objects.
 *
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let currentTable = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim().replace(/^\*\*|\*\*$/g, ''));

      // Check if it's separator row (| :--- | :---: |)
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));

      if (!currentTable) {
        currentTable = {
          headerLine: i,
          headers: cells,
          rows: [],
        };
      } else if (isSeparator) {
        // Just the separator line
      } else {
        const rowObj = {};
        cells.forEach((cell, idx) => {
          const headerKey = currentTable.headers[idx] || `col_${idx}`;
          rowObj[headerKey] = cell;
        });
        rowObj._rawCells = cells;
        currentTable.rows.push(rowObj);
      }
    } else {
      if (currentTable) {
        if (currentTable.rows.length > 0) {
          tables.push(currentTable);
        }
        currentTable = null;
      }
    }
  }

  if (currentTable && currentTable.rows.length > 0) {
    tables.push(currentTable);
  }

  return tables;
}

/**
 * Parses UX_AUDIT_REPORT.md and extracts structured audit semantics.
 *
 * @param {string} reportPath - Path to UX_AUDIT_REPORT.md.
 * @returns {object} Parsed report structure.
 */
export function parseReport(reportPath) {
  const result = {
    exists: false,
    filePath: reportPath,
    content: '',
    rawLength: 0,
    sections: [],
    tables: [],
    images: [],
    flowsCovered: {
      home: false,
      voice: false,
      planos: false,
      seats: false,
      preSubmission: {
        espera: false,
        cadastro: false,
        entrar: false,
        all: false,
      },
      legalManifesto: false,
      allRequiredFlows: false,
    },
    requiredSections: {
      executiveSummary: false,
      overallUxScore: false,
      userJourneyTimeline: false,
      usabilityHeuristicsAndIa: false,
      prioritizedImprovementMatrix: false,
      allPresent: false,
    },
    scoringBreakdown: {
      found: false,
      categories: [],
      overallScoreReported: null,
      calculatedAverage: null,
      mathMatches: false,
      difference: null,
    },
    journeySteps: [],
    matrixItems: [],
    sotaPillars: {
      designTokens: { found: false, matches: [] },
      conversionFlow: { found: false, matches: [] },
      microInteractions: { found: false, matches: [] },
      trustSignals: { found: false, matches: [] },
      allPillarsCovered: false,
    },
  };

  if (!fs.existsSync(reportPath)) {
    return result;
  }

  result.exists = true;
  const content = fs.readFileSync(reportPath, 'utf8');
  result.content = content;
  result.rawLength = content.length;

  // 1. Extract Headings and Sections
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    result.sections.push({
      level: match[1].length,
      title: match[2].trim(),
      index: match.index,
    });
  }

  // 2. Check Required Sections
  for (const s of result.sections) {
    const title = s.title.toLowerCase();
    if (/sum[áa]rio executivo|executive summary/i.test(title)) {
      result.requiredSections.executiveSummary = true;
    }
    if (/score.*(?:0-100|ponderado|maturidade)|\bscore\b/i.test(title)) {
      result.requiredSections.overallUxScore = true;
    }
    if (/mapa da jornada|user journey|timeline|step-by-step/i.test(title)) {
      result.requiredSections.userJourneyTimeline = true;
    }
    if (/heur[íi]stica|usability heuristics|arquitetura de informa|ia evaluation/i.test(title)) {
      result.requiredSections.usabilityHeuristicsAndIa = true;
    }
    if (/matriz de prioriza|prioritized improvement matrix|improvement matrix/i.test(title)) {
      result.requiredSections.prioritizedImprovementMatrix = true;
    }
  }

  // Also check if content has heuristic evaluation even if heading is combined
  if (!result.requiredSections.usabilityHeuristicsAndIa) {
    // Check if ISO 9241, Nielsen, or Heurísticas are explicitly evaluated in the text
    if (/nielsen|heur[íi]stica|iso\s*9241|hick's law|miller/i.test(content) &&
        /arquitetura de informa|ia|nav/i.test(content)) {
      // If present in dedicated section or prominent subsection
      result.requiredSections.usabilityHeuristicsAndIa = true;
    }
  }

  result.requiredSections.allPresent =
    result.requiredSections.executiveSummary &&
    result.requiredSections.overallUxScore &&
    result.requiredSections.userJourneyTimeline &&
    result.requiredSections.usabilityHeuristicsAndIa &&
    result.requiredSections.prioritizedImprovementMatrix;

  // 3. Check Flow Coverage
  const lowerContent = content.toLowerCase();
  result.flowsCovered.home = /home page|\bhome\b|\/ \(landing\)|p[áa]gina inicial/i.test(content);
  result.flowsCovered.voice = /\/voice\.html|voiceai|agente de voz/i.test(content);
  result.flowsCovered.planos = /\/planos\.html|planos e pre[çc]os|planos para empresas/i.test(content);
  result.flowsCovered.seats = /\/seats\.html|seats individuais|oferta individual/i.test(content);

  result.flowsCovered.preSubmission.espera = /\/espera\.html|lista de espera/i.test(content);
  result.flowsCovered.preSubmission.cadastro = /\/cadastro\.html|cadastro/i.test(content);
  result.flowsCovered.preSubmission.entrar = /\/entrar\.html|login|entrar/i.test(content);
  result.flowsCovered.preSubmission.all =
    result.flowsCovered.preSubmission.espera &&
    result.flowsCovered.preSubmission.cadastro &&
    result.flowsCovered.preSubmission.entrar;

  result.flowsCovered.legalManifesto = /\/manifesto\.html|manifesto|jur[íi]dico|\/juridico/i.test(content);

  result.flowsCovered.allRequiredFlows =
    result.flowsCovered.home &&
    result.flowsCovered.voice &&
    result.flowsCovered.planos &&
    result.flowsCovered.seats &&
    result.flowsCovered.preSubmission.all &&
    result.flowsCovered.legalManifesto;

  // 4. Extract Images
  const imgMdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = imgMdRegex.exec(content)) !== null) {
    result.images.push({
      alt: match[1],
      src: match[2],
      type: 'markdown',
      index: match.index,
    });
  }

  const imgHtmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = imgHtmlRegex.exec(content)) !== null) {
    result.images.push({
      alt: '',
      src: match[1],
      type: 'html',
      index: match.index,
    });
  }

  // 5. Parse Tables and Scoring Breakdown
  result.tables = parseMarkdownTables(content);

  for (const table of result.tables) {
    // Look for score table (has score column)
    const scoreCol = table.headers.find((h) => /score/i.test(h));
    const dimCol = table.headers.find((h) => /dimens[ãa]o|categoria|category|crit[ée]rio/i.test(h));

    if (scoreCol && dimCol) {
      result.scoringBreakdown.found = true;
      const categories = [];

      for (const row of table.rows) {
        const dimName = row[dimCol];
        const scoreStr = row[scoreCol];

        if (/score geral|overall|total|m[ée]dia/i.test(dimName)) {
          const matchScore = /(\d{1,3})\s*\/\s*100/.exec(scoreStr);
          if (matchScore) {
            result.scoringBreakdown.overallScoreReported = parseInt(matchScore[1], 10);
          }
        } else {
          const matchScore = /(\d{1,3})\s*\/\s*100/.exec(scoreStr);
          if (matchScore) {
            categories.push({
              name: dimName,
              score: parseInt(matchScore[1], 10),
            });
          }
        }
      }

      result.scoringBreakdown.categories = categories;

      if (categories.length > 0) {
        const sum = categories.reduce((acc, c) => acc + c.score, 0);
        const avg = Math.round(sum / categories.length);
        result.scoringBreakdown.calculatedAverage = avg;

        if (result.scoringBreakdown.overallScoreReported !== null) {
          const diff = Math.abs(avg - result.scoringBreakdown.overallScoreReported);
          result.scoringBreakdown.difference = diff;
          // Math matches within 1 point rounding error
          result.scoringBreakdown.mathMatches = diff <= 1;
        }
      }
    }

    // Look for Prioritized Matrix table
    const impactCol = table.headers.find((h) => /impacto|impact/i.test(h));
    const effortCol = table.headers.find((h) => /esfor[çc]o|effort/i.test(h));

    if (impactCol && effortCol) {
      result.matrixItems = table.rows.map((row) => ({
        id: row['ID'] || row['id'] || row['#'] || '',
        recommendation: row['Melhoria Recomendada'] || row['Melhoria'] || row['Recommendation'] || Object.values(row)[1] || '',
        category: row['Categoria'] || row['Pilar'] || row['Category'] || '',
        impact: row[impactCol],
        effort: row[effortCol],
        priority: row['Prioridade'] || row['Priority'] || row['Quadrant'] || '',
        rawRow: row,
      }));
    }
  }

  // 6. Parse Step-by-Step Journey and Friction Points
  const stepRegex = /###\s+(?:Etapa|Step)\s+(\d+)[:\s]+([^\n]+)/gi;
  const stepMatches = [];
  while ((match = stepRegex.exec(content)) !== null) {
    stepMatches.push({
      stepNum: match[1],
      title: match[2].trim(),
      index: match.index,
    });
  }

  for (let i = 0; i < stepMatches.length; i++) {
    const cur = stepMatches[i];
    const nextIndex = i + 1 < stepMatches.length ? stepMatches[i + 1].index : content.length;
    const stepBody = content.slice(cur.index, nextIndex);

    // Find image in this step
    const imgMatch = /!\[([^\]]*)\]\(([^)]+)\)/.exec(stepBody);
    const stepImage = imgMatch ? imgMatch[2] : null;

    // Find friction points (Atritos, Bloqueios, Confusões)
    const frictions = [];
    const frictionSectionMatch = /(?:Atritos e (?:Confusões|Bloqueios) Observados[:\s]*\**)([\s\S]*?)(?=\n---|\n###|$)/i.exec(stepBody);
    if (frictionSectionMatch) {
      let frictionBlock = frictionSectionMatch[1].trim();
      // Remove any leading or trailing ** marks
      frictionBlock = frictionBlock.replace(/^\*+\s*/, '').replace(/\*+$/, '');

      // Split into top-level bullet points (lines starting with at most 2 spaces followed by * or -)
      const rawBullets = frictionBlock.split(/\n(?=[\t ]{0,2}[*-]\s+)/);
      for (const rawB of rawBullets) {
        const cleanB = rawB.trim().replace(/^\*\s+/, '').trim();
        if (!cleanB || cleanB === '**') continue;

        // Try extracting bold title and rest
        const boldMatch = /^\*\*([^*]+)\*\*[:\s]*([\s\S]*)$/.exec(cleanB);
        if (boldMatch) {
          frictions.push({
            title: boldMatch[1].trim(),
            description: (boldMatch[1] + ' ' + boldMatch[2]).replace(/\s+/g, ' ').trim(),
            fullText: cleanB,
          });
        } else {
          frictions.push({
            title: cleanB.slice(0, 50).trim(),
            description: cleanB.replace(/\s+/g, ' ').trim(),
            fullText: cleanB,
          });
        }
      }
    }

    result.journeySteps.push({
      stepNum: cur.stepNum,
      title: cur.title,
      image: stepImage,
      frictions,
    });
  }

  // 7. Parse SOTA Pillars / Depth
  const designTokensTerms = ['design tokens', 'tipografia', 'geist', 'serif', 'font-size', 'clamp', 'paleta', 'contraste', 'tokens'];
  const conversionFlowTerms = ['funil de convers[ãa]o', 'convers[ãa]o', 'lista de espera vs', 'bifurca[çc][ãa]o', 'duplicidade', 'cta', 'onboarding'];
  const microInteractionTerms = ['micro-intera[çc]', 'microcopy', 'tooltips', 'hover', 'orb', 'anima[çc][ãa]o', 'pulso', 'feedback'];
  const trustSignalsTerms = ['trust signals', 'sinais de confian[çc]a', 'lgpd', 'iso 27001', 'anpd', 'soberania', 'credenciais', 'fundador'];

  function checkPillar(terms) {
    const matches = [];
    for (const term of terms) {
      const regex = new RegExp(term, 'gi');
      if (regex.test(content)) {
        matches.push(term);
      }
    }
    return { found: matches.length >= 2, matches };
  }

  result.sotaPillars.designTokens = checkPillar(designTokensTerms);
  result.sotaPillars.conversionFlow = checkPillar(conversionFlowTerms);
  result.sotaPillars.microInteractions = checkPillar(microInteractionTerms);
  result.sotaPillars.trustSignals = checkPillar(trustSignalsTerms);

  result.sotaPillars.allPillarsCovered =
    result.sotaPillars.designTokens.found &&
    result.sotaPillars.conversionFlow.found &&
    result.sotaPillars.microInteractions.found &&
    result.sotaPillars.trustSignals.found;

  return result;
}
