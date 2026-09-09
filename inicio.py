from flask import Flask, render_template, request, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os 
from werkzeug.security import check_password_hash
load_dotenv() 
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from flask import jsonify
import base64
import requests
from datetime import datetime
IMAGEKIT_PRIVATE_KEY = os.getenv('IMAGEKIT_PRIVATE_KEY')
IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"

def subir_imagen_imagekit(archivo):
    auth = base64.b64encode(f"{IMAGEKIT_PRIVATE_KEY}:".encode()).decode()
    respuesta = requests.post(
        IMAGEKIT_UPLOAD_URL,
        headers={"Authorization": f"Basic {auth}"},
        files={"file": (archivo.filename, archivo.read(), archivo.mimetype)},
        data={"fileName": archivo.filename}
    )
    respuesta.raise_for_status()
    return respuesta.json()

app=Flask(__name__)
@app.context_processor
def inyectar_anio():
    return {'anio_actual': datetime.now().year} 

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.secret_key = os.getenv('SECRET_KEY')
db = SQLAlchemy(app)

app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

##Definicion de las clases en la BD 
class tmstatus(db.Model):
    codstatus=db.Column('pkcodstatus',db.Integer, primary_key=True)
    dstatus=db.Column('dstatus',db.String(15),)


class tmusuario(db.Model):

    cod_usuario=db.Column('pkcodusuario',db.Integer, primary_key=True)
    nom_usuario=db.Column('nom_usuario',db.String(15),nullable=False)
    contra_usuario=db.Column('con_usuario',db.String(260),nullable=False)
    fkcods=db.Column('fkcods',db.Integer,db.ForeignKey('tmstatus.pkcodstatus'),nullable=False)

class tmproductos(db.Model):
    cod_producto=db.Column('pkcodproducto',db.Integer, primary_key=True)
    nombre_producto=db.Column('nombre_p',db.String(100), nullable=False)
    precio_producto=db.Column('precio',db.Numeric(10,2), nullable=False)
    precio_mayor = db.Column(db.Numeric(10, 2))
    estado=db.Column('fkcods',db.Integer,db.ForeignKey('tmstatus.pkcodstatus'),nullable=False)
    url_imagen=db.Column('imagen_produ',db.String(100))
    categoria_id = db.Column('fkcodcategoria', db.Integer, db.ForeignKey('tmcategorias.pkcodcategoria'))
    categoria = db.relationship('tmcategorias')


class tmcategorias(db.Model):
    codcategoria = db.Column('pkcodcategoria', db.Integer, primary_key=True)
    dcategoria = db.Column('dcategoria', db.String(40), nullable=False)
    imagen_categoria = db.Column('imagen_categoria', db.String(150))

@app.route('/admin/salir')
def salir():
    session.pop('usuario_id', None)
    return redirect(url_for('admin'))

def obtener_status(nombre_status):
    status = tmstatus.query.filter_by(dstatus=nombre_status).first()
    return status.codstatus if status else None

def validar_datos_producto(nombre, precio, precio_mayor, imagen):
    """Valida los datos del formulario de producto antes de tocar la BD.
    Es el respaldo en el servidor de la validación que ya hace
    validacion_producto.js en el navegador (por si alguien la evita)."""
    errores = []

    if not nombre or not nombre.strip():
        errores.append('El nombre del producto es obligatorio.')
    elif len(nombre) > 100:
        errores.append(f'El nombre es muy largo ({len(nombre)}/100 caracteres).')

    def _validar_precio(valor, etiqueta, requerido):
        if valor in (None, ''):
            if requerido:
                errores.append(f'{etiqueta} es obligatorio.')
            return
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            errores.append(f'{etiqueta} no es un número válido.')
            return
        if numero <= 0:
            errores.append(f'{etiqueta} debe ser mayor a 0.')
        elif numero > 99999999.99:
            errores.append(f'{etiqueta} es demasiado alto (máximo 99.999.999,99).')

    _validar_precio(precio, 'El precio', requerido=True)
    _validar_precio(precio_mayor, 'El precio al por mayor', requerido=False)

    if imagen and imagen.filename and len(imagen.filename) > 60:
        errores.append(
            f'El nombre de la imagen es muy largo ({len(imagen.filename)}/60 caracteres). Renómbrala antes de subirla.'
        )

    return errores

def login_requerido(f):
    @wraps(f)
    def decorado(*args, **kwargs):
        if 'usuario_id' not in session:
            return redirect(url_for('admin'))
        return f(*args, **kwargs)
    return decorado

@app.route('/')
def inicio():
    pagina = request.args.get('pagina', 1, type=int)
    paginacion = (
        tmproductos.query
        .join(tmstatus, tmproductos.estado == tmstatus.codstatus)
        .filter(tmstatus.dstatus == 'ACTIVO')
        .paginate(page=pagina, per_page=10, error_out=False)
    )
    categorias = tmcategorias.query.order_by(tmcategorias.dcategoria).all()
    

    return render_template('index.html', productos=paginacion.items,
                            paginacion=paginacion, categorias=categorias)


@app.route('/admin')
@login_requerido
def panel_admin():
    pagina = request.args.get('pagina', 1, type=int)
    busqueda = request.args.get('q', '')

    consulta = tmproductos.query
    if busqueda:
        consulta = consulta.filter(tmproductos.nombre_producto.ilike(f'%{busqueda}%'))

    paginacion = consulta.order_by(tmproductos.cod_producto.desc()).paginate(page=pagina, per_page=20, error_out=False)

    return render_template('panel_admin.html', productos=paginacion.items,
                            paginacion=paginacion, busqueda=busqueda)

@app.route('/admin/login', methods=['GET', 'POST'])
def admin():
    if request.method == 'POST':
        nombre = request.form.get('usuario')
        contraseña = request.form.get('contraseña')

        if not nombre or not contraseña:
            return render_template('login.html', error='Completa usuario y contraseña')

        admin = tmusuario.query.filter_by(nom_usuario=nombre).first()

        if admin and check_password_hash(admin.contra_usuario, contraseña):
            session['usuario_id'] = admin.cod_usuario
            return redirect(url_for('panel_admin'))
        else:
            return render_template('login.html', error='Usuario o contraseña incorrectos')

    return render_template('login.html')

@app.route('/admin/productos/nuevo', methods=['GET', 'POST'])
@login_requerido
def nuevo_producto():
    categorias = tmcategorias.query.order_by(tmcategorias.dcategoria).all()

    if request.method == 'POST':
        nombre = request.form.get('nombre')
        precio = request.form.get('precio')
        precio_mayor = request.form.get('precio_mayor')
        disponible = request.form.get('disponible')
        categoria_id = request.form.get('categoria') or None
        imagen = request.files.get('imagen')

        errores = validar_datos_producto(nombre, precio, precio_mayor, imagen)
        if errores:
            return render_template('nuevo_producto.html', categorias=categorias, errores=errores)

        estado_id = obtener_status('ACTIVO') if disponible else obtener_status('ELIMINADO')

        producto = tmproductos(
            nombre_producto=nombre,
            precio_producto=precio,
            precio_mayor=precio_mayor or None,
            estado=estado_id,
            categoria_id=categoria_id
        )

        if imagen and imagen.filename:
            resultado = subir_imagen_imagekit(imagen)
            producto.url_imagen = resultado['url']

        db.session.add(producto)
        db.session.commit()
        return redirect(url_for('panel_admin'))

    return render_template('nuevo_producto.html', categorias=categorias)

@app.route('/admin/productos/buscar')
@login_requerido
def buscar_productos_admin():
    termino = request.args.get('q', '')
    productos = tmproductos.query.filter(
        tmproductos.nombre_producto.ilike(f'%{termino}%')
    ).all()

    resultado = [{
        'id': p.cod_producto,
        'nombre': p.nombre_producto,
        'precio': float(p.precio_producto),
        'imagen': p.url_imagen
    } for p in productos]

    return jsonify(resultado)

@app.route('/productos/buscar')
def buscar_productos_publico():
    termino = request.args.get('q', '')
    productos = (
        tmproductos.query
        .join(tmstatus, tmproductos.estado == tmstatus.codstatus)
        .filter(tmstatus.dstatus == 'ACTIVO')
        .filter(tmproductos.nombre_producto.ilike(f'%{termino}%'))
        .all()
    )

    resultado = [{
        'id': p.cod_producto,
        'nombre': p.nombre_producto,
        'precio': float(p.precio_producto),
        'imagen': p.url_imagen
    } for p in productos]

    return jsonify(resultado)

@app.route('/admin/productos/<int:id>/editar', methods=['GET', 'POST'])
@login_requerido
def editar_producto(id):
    producto = tmproductos.query.get_or_404(id)
    categorias = tmcategorias.query.order_by(tmcategorias.dcategoria).all()

    if request.method == 'POST':
        nombre = request.form.get('nombre')
        precio = request.form.get('precio')
        precio_mayor = request.form.get('precio_mayor')
        imagen = request.files.get('imagen')

        errores = validar_datos_producto(nombre, precio, precio_mayor, imagen)
        if errores:
            # Repoblamos los campos con lo que el usuario escribió (no lo que
            # había guardado antes) para que no pierda su cambio al corregir.
            producto.nombre_producto = nombre
            producto.precio_producto = precio or producto.precio_producto
            producto.precio_mayor = precio_mayor or None
            return render_template('editar_producto.html', producto=producto, categorias=categorias, errores=errores)

        producto.nombre_producto = nombre
        producto.precio_producto = precio
        producto.precio_mayor = precio_mayor or None
        producto.categoria_id = request.form.get('categoria') or None

        disponible = request.form.get('disponible')
        producto.estado = obtener_status('ACTIVO') if disponible else obtener_status('ELIMINADO')

        if imagen and imagen.filename:
            resultado = subir_imagen_imagekit(imagen)
            producto.url_imagen = resultado['url']

        db.session.commit()
        return redirect(url_for('panel_admin'))

    return render_template('editar_producto.html', producto=producto, categorias=categorias)

@app.route('/admin/productos/<int:id>/eliminar', methods=['POST'])
@login_requerido
def eliminar_producto(id):
    producto = tmproductos.query.get_or_404(id)
    db.session.delete(producto)
    db.session.commit()
    return redirect(url_for('panel_admin'))

@app.route('/nosotros')
def nosotros():
    return render_template('nosotros.html')



@app.route('/catalogo')
def catalogo():
    categoria_id = request.args.get('categoria', type=int)
    pagina = request.args.get('pagina', 1, type=int)

    categorias = tmcategorias.query.order_by(tmcategorias.dcategoria).all()

    consulta = (
        tmproductos.query
        .join(tmstatus, tmproductos.estado == tmstatus.codstatus)
        .filter(tmstatus.dstatus == 'ACTIVO')
    )
    if categoria_id:
        consulta = consulta.filter(tmproductos.categoria_id == categoria_id)

    paginacion = consulta.paginate(page=pagina, per_page=12, error_out=False)


    return render_template('catalogo.html',
                            productos=paginacion.items,
                            paginacion=paginacion,
                            categorias=categorias,
                            categoria_actual=categoria_id)


if __name__ == '__main__':
    app.run(debug=True)

