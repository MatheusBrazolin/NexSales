import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

export type LoginFormData = z.infer<typeof loginSchema>

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
