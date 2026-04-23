-- Adiciona coluna slots_confirmados em tokens_agendamento
ALTER TABLE tokens_agendamento
  ADD COLUMN IF NOT EXISTS slots_confirmados jsonb DEFAULT NULL;
