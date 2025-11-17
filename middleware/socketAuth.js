import jwt from "jsonwebtoken";

const verifyJWT = (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("Noo token provided"))

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        socket.user = decoded;
        next();
    } catch (error) {
        next(new Error("Unauthorized"))
    }
}

export default verifyJWT