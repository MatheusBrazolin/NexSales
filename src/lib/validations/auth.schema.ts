import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Informe o usuário').trim(),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const createEmployeeSchema = z.object({
  firstName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(60).trim(),
  lastName: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres').max(80).trim(),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-z0-9._-]+$/i, 'Apenas letras, números, ponto, underscore e hífen')
    .trim()
    .toLowerCase(),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>

export const signUpSchema = z
  .object({
    firstName: z
      .string()
      .min(2, 'Nome deve ter pelo menos 2 caracteres')
      .max(60, 'Nome muito longo')
      .trim(),
    lastName: z
      .string()
      .min(2, 'Sobrenome deve ter pelo menos 2 caracteres')
      .max(80, 'Sobrenome muito longo')
      .trim(),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme a senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

export type SignUpFormData = z.infer<typeof signUpSchema>
