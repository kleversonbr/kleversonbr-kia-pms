# Especificação de Segurança do KIA Project Suite

## 1. Invariantes de Dados
- Um colaborador não pode ser visualizado ou modificado por outros usuários. Deve ser protegido pelo `userId`.
- Um projeto e suas alocações, ciclos de input e marcos pertencem ao respectivo criador (`userId`).
- Os campos de ID devem ter tamanho razoável e formato alfa-numérico.

## 2. Exemplos de Payloads Permitidos e Rejeitados ("Dirty Dozen")
- **PBP1 (Rejeitado):** Tentar criar um projeto com o `userId` de outro usuário.
- **PBP2 (Rejeitado):** Tentar atualizar o status/estágio de um projeto sem autenticação.
- **PBP3 (Rejeitado):** Injetar 1MB no ID do projeto.

*(Especificação detalhada do plano de segurança)*
