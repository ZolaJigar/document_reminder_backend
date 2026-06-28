const { z } = require('zod');

const createRoleSchema = z.object({
  name: z.string().min(1).max(255),
  is_editable: z.coerce.number().int().min(0).max(1).optional(),
  is_deletable: z.coerce.number().int().min(0).max(1).optional(),
  permissions: z
    .array(z.coerce.number().int().positive())
    .optional()
    .default([]),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  is_editable: z.coerce.number().int().min(0).max(1).optional(),
  is_deletable: z.coerce.number().int().min(0).max(1).optional(),
  permissions: z.array(z.coerce.number().int().positive()).optional(),
});

const assignRoleSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  role_id: z.coerce.number().int().positive(),
});

const roleParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  roleParamsSchema,
};
