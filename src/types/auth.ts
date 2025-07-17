export interface UserSignupData {
  email: string;
  password: string;
  name: string;
}

export interface registeredUser{
   email: string;
  password: string;
  name: string;
    token: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isLoggedIn: boolean;
}