export interface AudienceRecord {
  author: string;
  avatarUrl?: string;
  totalStreams: number;
  lastStreamDate: string; // ISO YYYY-MM-DD
  streamDates: string[];  // Lista de datas de transmissões em que marcou presença
  defaultLocation?: string;
  knownCompanions?: string[];
}

export interface AudienceDatabaseData {
  records: { [authorKey: string]: AudienceRecord };
  lastUpdated: string;
}

const STORAGE_KEY = 'escrituras_audience_database_v1';

export const audienceDatabaseService = {
  /**
   * Carrega o banco de dados do localStorage local
   */
  getDB(): AudienceDatabaseData {
    try {
      const dataStr = localStorage.getItem(STORAGE_KEY);
      if (dataStr) {
        return JSON.parse(dataStr);
      }
    } catch (e) {
      console.warn("Erro ao carregar banco de dados de audiência:", e);
    }
    return { records: {}, lastUpdated: new Date().toISOString() };
  },

  /**
   * Salva o banco de dados no localStorage
   */
  saveDB(db: AudienceDatabaseData): void {
    try {
      db.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("Erro ao salvar banco de dados de audiência:", e);
    }
  },

  /**
   * Registra a participação de um espectador na transmissão atual.
   * Retorna os dados atualizados incluindo a localização salva (caso o espectador não tenha digitado uma nova no chat atual).
   */
  recordParticipant(
    author: string, 
    avatarUrl?: string, 
    location?: string, 
    companions?: string[]
  ): AudienceRecord | undefined {
    if (!author || typeof author !== 'string' || author.trim().length === 0) return undefined;
    const db = this.getDB();
    const key = author.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];

    let record = db.records[key];

    if (!record) {
      record = {
        author: author.trim(),
        avatarUrl,
        totalStreams: 1,
        lastStreamDate: today,
        streamDates: [today],
        defaultLocation: location,
        knownCompanions: companions && companions.length > 0 ? companions : undefined
      };
    } else {
      // Atualiza nome exibido se necessário
      record.author = author.trim();
      if (avatarUrl) record.avatarUrl = avatarUrl;

      // Se não esteve presente nesta data ainda, incrementa total de transmissões
      if (!record.streamDates.includes(today)) {
        record.streamDates.push(today);
        record.totalStreams += 1;
        record.lastStreamDate = today;
      }

      // Se enviou nova localização, salva como a localização padrão para as próximas vezes
      if (location && location.trim().length > 0) {
        record.defaultLocation = location.trim();
      }

      // Se enviou novos acompanhantes, mescla com os conhecidos
      if (companions && companions.length > 0) {
        const existingComps = record.knownCompanions || [];
        record.knownCompanions = Array.from(new Set([...existingComps, ...companions]));
      }
    }

    db.records[key] = record;
    this.saveDB(db);
    return record;
  },

  /**
   * Obtém a localização salva previamente de uma pessoa no banco de dados local
   */
  getSavedLocation(author: string): string | undefined {
    if (!author || typeof author !== 'string' || author.trim().length === 0) return undefined;
    const db = this.getDB();
    const key = author.toLowerCase().trim();
    return db.records[key]?.defaultLocation;
  },

  /**
   * Obtém todas as estatísticas registradas de espectadores (ordenados pelos mais assíduos)
   */
  getAllStats(): AudienceRecord[] {
    const db = this.getDB();
    const records = Object.values(db.records);
    return records.sort((a, b) => b.totalStreams - a.totalStreams);
  },

  /**
   * Baixa o arquivo JSON do banco de dados local para guardar na pasta do projeto
   */
  exportDatabaseJSON(): void {
    const db = this.getDB();
    const jsonStr = JSON.stringify(db, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `banco_audiencia_escrituras_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Importa um arquivo JSON pré-existente
   */
  importDatabaseJSON(jsonContent: string): boolean {
    try {
      const imported: AudienceDatabaseData = JSON.parse(jsonContent);
      if (imported && imported.records) {
        const current = this.getDB();
        const mergedRecords = { ...current.records, ...imported.records };
        this.saveDB({ records: mergedRecords, lastUpdated: new Date().toISOString() });
        return true;
      }
    } catch (e) {
      console.error("Erro ao importar banco de dados JSON:", e);
    }
    return false;
  }
};
