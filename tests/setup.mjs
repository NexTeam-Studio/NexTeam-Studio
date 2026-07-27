// Tests opt into a named fixture tenant and non-durable stores explicitly.
process.env.NODE_ENV = "test";
process.env.TENANT_ID ||= "aquatrace";
process.env.TENANT_NAME ||= "Aquatrace";
process.env.ALLOW_IN_MEMORY_PERSISTENCE ||= "true";
