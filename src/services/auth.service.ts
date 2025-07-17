
import jwt from "jsonwebtoken";
import { UserSignupData,registeredUser } from "../types/auth";
import {
  throwEmailExists,
  InternalServerError
} from "../utils/error";
  

import { PrismaClient } from '@prisma/client'
import { hashPassword } from "../utils/bcrypt";


const prisma = new PrismaClient()

export const createUser = async (userSignupData: UserSignupData): Promise<registeredUser> => { 
  try {
    const usedEmail = await emailExists(userSignupData.email);
    if (!usedEmail) {
      throw  throwEmailExists();
    }
    const hashedPassword = await hashPassword(userSignupData.password);
    userSignupData.password = hashedPassword;


    let user = await prisma.user.create({
      data: userSignupData
    })

    if (!user) {
      throw new InternalServerError("User creation failed");
    }
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET as string, {
      expiresIn: '15d'
    })
    let registeredUser = {
      ...user,
        token
    };
    return registeredUser;
  } catch (error) {
    throw new Error("Error creating user")
  }
}


export const emailExists = async (email: string): Promise<boolean> => {
  const user  = await prisma.user.findUnique({
    where: { email }
  })
  if(user) {
    return false;
  }
  return true
}
